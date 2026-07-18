import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(q: string | undefined, page: number, pageSize: number) {
    const where = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { patientCode: { contains: q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return { data, page, pageSize, total };
  }

  async getById(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: {
        invoices: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { items: { include: { test: { select: { code: true, nameEn: true } } } } },
        },
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }

  /** Allocate the next sequential patient code transactionally. */
  private async nextPatientCode(tx: PrismaService | any): Promise<string> {
    const counter = await tx.sequenceCounter.upsert({
      where: { key: "patient_code" },
      update: { value: { increment: 1 } },
      create: { key: "patient_code", value: 100001 },
    });
    return `LL-${String(counter.value).padStart(6, "0")}`;
  }

  async create(
    dto: { fullName: string; yearOfBirth?: number; phone?: string; address?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    const patient = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextPatientCode(tx);
      const created = await tx.patient.create({
        data: { patientCode: code, ...dto },
      });
      await this.audit.log(
        user,
        {
          action: "patient.create",
          module: "patients",
          objectType: "patient",
          objectId: created.id,
          newValues: { patientCode: code, fullName: dto.fullName },
          ...meta,
        },
        tx,
      );
      return created;
    });
    return patient;
  }

  async update(
    id: string,
    dto: { fullName?: string; yearOfBirth?: number; phone?: string; address?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    const existing = await this.prisma.patient.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Patient not found");
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.patient.update({ where: { id }, data: dto });
      await this.audit.log(
        user,
        {
          action: "patient.update",
          module: "patients",
          objectType: "patient",
          objectId: id,
          oldValues: { fullName: existing.fullName, phone: existing.phone, address: existing.address, yearOfBirth: existing.yearOfBirth },
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return u;
    });
    return updated;
  }
}
