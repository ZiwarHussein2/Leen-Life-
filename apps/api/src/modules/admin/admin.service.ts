import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { MFA_REQUIRED_ROLES } from "@leen-life/permissions";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

/** Models that support soft-delete restore. */
const RESTORABLE: Record<string, string> = {
  patient: "patient",
  invoice: "invoice",
  test: "test",
  user: "user",
  referral_partner: "referralPartner",
  file: "storedFile",
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Admin dashboard KPIs (spec §20). */
  async dashboard(user: AuthenticatedUser) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const queueDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    const [
      patientsToday,
      queues,
      testsCompleted,
      reportsPending,
      reportsCompleted,
      discountsPending,
      lowStock,
      attendanceIssues,
      revenueToday,
      securityAlerts,
    ] = await Promise.all([
      this.prisma.invoice.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
      this.prisma.queueEntry.groupBy({
        by: ["departmentId", "status"],
        where: { queueDate },
        _count: true,
      }),
      this.prisma.invoiceItem.count({
        where: { status: "COMPLETED", updatedAt: { gte: startOfDay } },
      }),
      this.prisma.invoiceItem.count({ where: { status: { in: ["AWAITING_REPORT", "REPORT_IN_PROGRESS"] } } }),
      this.prisma.report.count({ where: { submittedAt: { gte: startOfDay } } }),
      this.prisma.discountRequest.count({ where: { status: "PENDING" } }),
      this.prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM department_inventory WHERE "currentQuantity" <= "lowStockThreshold"`,
      this.prisma.attendanceRecord.count({
        where: { workDate: queueDate, status: { in: ["LATE", "REJECTED_OUT_OF_GEOFENCE", "EARLY_LEAVE"] } },
      }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: startOfDay } },
        _sum: { amount: true },
      }),
      this.prisma.securityAlert.count({ where: { status: "OPEN" } }),
    ]);

    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
    });
    const queueStatus = departments
      .filter((d) => ["SONAR", "MRI", "CT", "XRAY", "MAMMOGRAPHY", "DEXA"].includes(d.type))
      .map((d) => ({
        department: d,
        waiting: queues.filter((q) => q.departmentId === d.id && q.status === "WAITING").reduce((s, q) => s + q._count, 0),
        inProgress: queues.filter((q) => q.departmentId === d.id && q.status === "IN_PROGRESS").reduce((s, q) => s + q._count, 0),
        done: queues.filter((q) => q.departmentId === d.id && q.status === "DONE").reduce((s, q) => s + q._count, 0),
      }));

    return {
      patientsToday,
      queueStatus,
      testsCompletedToday: testsCompleted,
      reportsPending,
      reportsCompletedToday: reportsCompleted,
      discountsPendingApproval: discountsPending,
      lowStockCount: (lowStock as any)[0]?.count ?? 0,
      attendanceIssuesToday: attendanceIssues,
      revenueToday: revenueToday._sum.amount ?? 0,
      openSecurityAlerts: securityAlerts,
    };
  }

  listUsers(q?: string) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        mfaRequired: true,
        language: true,
        role: { select: { key: true, name: true } },
        department: { select: { id: true, name: true, type: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUser(dto: any, actor: AuthenticatedUser, meta: Meta) {
    const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
    if (!role) throw new BadRequestException("Unknown role");
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          phone: dto.phone ?? null,
          roleId: role.id,
          branchId: actor.branchId,
          departmentId: dto.departmentId ?? null,
          status: "ACTIVE",
          language: dto.language ?? "en",
          mfaRequired: MFA_REQUIRED_ROLES.includes(dto.roleKey),
        },
      });
      await this.audit.log(
        actor,
        {
          action: "user.create",
          module: "users",
          objectType: "user",
          objectId: user.id,
          newValues: { email: user.email, roleKey: dto.roleKey, departmentId: dto.departmentId },
          ...meta,
        },
        tx,
      );
      return user;
    });
  }

  async updateUser(id: string, dto: any, actor: AuthenticatedUser, meta: Meta) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!existing) throw new NotFoundException("User not found");
    let roleId: string | undefined;
    if (dto.roleKey) {
      const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
      if (!role) throw new BadRequestException("Unknown role");
      roleId = role.id;
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.fullName ? { fullName: dto.fullName } : {}),
          ...(roleId ? { roleId, mfaRequired: MFA_REQUIRED_ROLES.includes(dto.roleKey) } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
      await this.audit.log(
        actor,
        {
          action: "user.update",
          module: "users",
          objectType: "user",
          objectId: id,
          oldValues: { roleKey: existing.role.key, status: existing.status, departmentId: existing.departmentId },
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return user;
    });
  }

  listDepartments() {
    return this.prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  auditLogs(
    filter: { action?: string; userId?: string; objectId?: string },
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(filter.action ? { action: { contains: filter.action } } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.objectId ? { objectId: filter.objectId } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.auditLog.count({ where }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  securityAlerts(status?: string) {
    return this.prisma.securityAlert.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /** Restore a soft-deleted record; always audited with reason trail. */
  async restore(objectType: string, id: string, user: AuthenticatedUser, meta: Meta) {
    const model = RESTORABLE[objectType];
    if (!model) throw new BadRequestException(`Cannot restore objects of type ${objectType}`);
    const delegate = (this.prisma as any)[model];
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Record not found");
    if (!existing.deletedAt) throw new BadRequestException("Record is not deleted");
    const restored = await this.prisma.$transaction(async (tx) => {
      const r = await (tx as any)[model].update({ where: { id }, data: { deletedAt: null } });
      await this.audit.log(
        user,
        {
          action: "record.restore",
          module: "admin",
          objectType,
          objectId: id,
          oldValues: { deletedAt: existing.deletedAt },
          newValues: { deletedAt: null },
          ...meta,
        },
        tx,
      );
      return r;
    });
    return restored;
  }
}
