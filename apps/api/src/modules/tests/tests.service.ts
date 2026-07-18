import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { effectivePrice, minutesOfDay } from "../../domain/pricing";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(departmentId?: string, active?: boolean) {
    return this.prisma.test.findMany({
      where: {
        deletedAt: null,
        ...(departmentId ? { departmentId } : {}),
        ...(active === undefined ? {} : { active }),
      },
      include: { timePriceRules: true, department: { select: { id: true, name: true, type: true } } },
      orderBy: { code: "asc" },
    });
  }

  async create(dto: any, user: AuthenticatedUser, meta: Meta) {
    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.test.create({ data: dto });
      await this.audit.log(
        user,
        { action: "test.create", module: "pricing", objectType: "test", objectId: t.id, newValues: dto, ...meta },
        tx,
      );
      return t;
    });
    return created;
  }

  async update(id: string, dto: any, user: AuthenticatedUser, meta: Meta) {
    const existing = await this.prisma.test.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Test not found");
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.test.update({ where: { id }, data: dto });
      await this.audit.log(
        user,
        {
          action: "test.update",
          module: "pricing",
          objectType: "test",
          objectId: id,
          oldValues: {
            basePrice: existing.basePrice,
            requiresReportDefault: existing.requiresReportDefault,
            active: existing.active,
          },
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return t;
    });
    return updated;
  }

  async createTimePriceRule(
    dto: { testId: string; startTime: string; endTime: string; price: number },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    minutesOfDay(dto.startTime);
    minutesOfDay(dto.endTime);
    const test = await this.prisma.test.findFirst({ where: { id: dto.testId, deletedAt: null } });
    if (!test) throw new NotFoundException("Test not found");
    if (dto.startTime === dto.endTime) {
      throw new BadRequestException("Time window cannot be empty");
    }
    const rule = await this.prisma.$transaction(async (tx) => {
      const r = await tx.timePriceRule.create({
        data: {
          testId: dto.testId,
          departmentId: test.departmentId,
          startTime: dto.startTime,
          endTime: dto.endTime,
          price: dto.price,
          createdById: user.userId,
        },
      });
      await this.audit.log(
        user,
        { action: "price.rule.create", module: "pricing", objectType: "time_price_rule", objectId: r.id, newValues: dto, ...meta },
        tx,
      );
      return r;
    });
    return rule;
  }

  async currentPrice(testId: string, at: Date) {
    const test = await this.prisma.test.findFirst({
      where: { id: testId, deletedAt: null },
      include: { timePriceRules: true },
    });
    if (!test) throw new NotFoundException("Test not found");
    const { price, ruleId } = effectivePrice(test.basePrice, test.timePriceRules, at);
    return { testId, at, basePrice: test.basePrice, price, appliedRuleId: ruleId };
  }
}
