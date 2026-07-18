import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Core department-isolation rule (spec §12.1): a user with only
   * queues.read.own-department is forced onto their own department; the
   * requested departmentId is ignored for them.
   */
  async list(user: AuthenticatedUser, departmentId?: string, date?: string) {
    const canReadAll = user.permissions.includes("queues.read.all");
    let effectiveDepartmentId: string | undefined;
    if (canReadAll) {
      effectiveDepartmentId = departmentId;
    } else {
      if (!user.departmentId) {
        throw new ForbiddenException("No department assigned");
      }
      effectiveDepartmentId = user.departmentId;
    }
    const day = date ? new Date(date) : new Date();
    const queueDate = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));

    return this.prisma.queueEntry.findMany({
      where: {
        queueDate,
        ...(effectiveDepartmentId ? { departmentId: effectiveDepartmentId } : {}),
        branchId: user.branchId,
      },
      include: {
        patient: { select: { id: true, patientCode: true, fullName: true, yearOfBirth: true } },
        invoiceItem: {
          select: {
            id: true,
            status: true,
            requiresReport: true,
            test: { select: { code: true, nameEn: true, nameAr: true, nameKu: true, estimatedMinutes: true } },
          },
        },
        department: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ priority: "desc" }, { position: "asc" }],
    });
  }

  /** Queue reorder always logs who/old/new/reason (spec §12.2). */
  async reorder(
    queueId: string,
    newPosition: number,
    reason: string,
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findUnique({ where: { id: queueId } });
      if (!entry) throw new NotFoundException("Queue entry not found");
      if (entry.status !== "WAITING") {
        throw new BadRequestException("Only waiting entries can be reordered");
      }
      const oldPosition = entry.position;
      if (oldPosition === newPosition) return entry;

      // Shift the affected range, then place the entry.
      if (newPosition < oldPosition) {
        await tx.queueEntry.updateMany({
          where: {
            departmentId: entry.departmentId,
            queueDate: entry.queueDate,
            position: { gte: newPosition, lt: oldPosition },
          },
          data: { position: { increment: 1 } },
        });
      } else {
        await tx.queueEntry.updateMany({
          where: {
            departmentId: entry.departmentId,
            queueDate: entry.queueDate,
            position: { gt: oldPosition, lte: newPosition },
          },
          data: { position: { decrement: 1 } },
        });
      }
      const updated = await tx.queueEntry.update({
        where: { id: queueId },
        data: { position: newPosition },
      });
      await tx.queueChangeLog.create({
        data: {
          queueId,
          oldPosition,
          newPosition,
          changedById: user.userId,
          reason,
        },
      });
      await this.audit.log(
        user,
        {
          action: "queue.reorder",
          module: "queues",
          objectType: "queue_entry",
          objectId: queueId,
          oldValues: { position: oldPosition },
          newValues: { position: newPosition },
          reason,
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }
}
