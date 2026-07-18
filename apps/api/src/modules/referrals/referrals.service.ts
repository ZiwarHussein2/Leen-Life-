import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPartners(q?: string) {
    return this.prisma.referralPartner.findMany({
      where: {
        deletedAt: null,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { deals: { where: { status: "ACTIVE" }, orderBy: { activeFrom: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    });
  }

  async createPartner(dto: any, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.referralPartner.create({ data: dto });
      await this.audit.log(
        user,
        { action: "referral.partner.create", module: "referrals", objectType: "referral_partner", objectId: partner.id, newValues: dto, ...meta },
        tx,
      );
      return partner;
    });
  }

  async createDeal(partnerId: string, dto: any, user: AuthenticatedUser, meta: Meta) {
    if (dto.dealType === "FIXED_PER_PATIENT" && !dto.amount) {
      throw new BadRequestException("Fixed deals need an amount");
    }
    if (dto.dealType === "PERCENTAGE" && dto.percentage === undefined) {
      throw new BadRequestException("Percentage deals need a percentage");
    }
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.referralPartner.findFirst({ where: { id: partnerId, deletedAt: null } });
      if (!partner) throw new NotFoundException("Partner not found");
      // Close previous active deals; historical transactions keep the
      // deal snapshot they were created with (spec §33.2).
      await tx.referralDeal.updateMany({
        where: { referralPartnerId: partnerId, status: "ACTIVE" },
        data: { status: "INACTIVE", activeTo: new Date() },
      });
      const deal = await tx.referralDeal.create({
        data: {
          referralPartnerId: partnerId,
          dealType: dto.dealType,
          amount: dto.amount ?? null,
          percentage: dto.percentage ?? null,
          appliesAsDiscount: dto.appliesAsDiscount ?? dto.dealType === "DISCOUNT_TO_PATIENT",
          notes: dto.notes ?? null,
          createdById: user.userId,
        },
      });
      await this.audit.log(
        user,
        { action: "referral.deal.create", module: "referrals", objectType: "referral_deal", objectId: deal.id, newValues: dto, ...meta },
        tx,
      );
      return deal;
    });
  }

  /** Balance summary (spec §18.2). */
  async partnerBalance(partnerId: string) {
    const partner = await this.prisma.referralPartner.findFirst({
      where: { id: partnerId, deletedAt: null },
    });
    if (!partner) throw new NotFoundException("Partner not found");
    const transactions = await this.prisma.referralTransaction.findMany({
      where: { referralPartnerId: partnerId },
    });
    const referredPatients = new Set(transactions.map((t) => t.patientId)).size;
    const payable = transactions.filter((t) => t.payableToPartner && !t.appliedAsDiscount);
    const discounts = transactions.filter((t) => t.appliedAsDiscount);
    const paid = payable.filter((t) => t.status === "PAID").reduce((s, t) => s + t.amount, 0);
    const totalEarned = payable.reduce((s, t) => s + t.amount, 0);
    return {
      partner: { id: partner.id, name: partner.name },
      referredPatients,
      totalCommissionEarned: totalEarned,
      totalDiscountsGiven: discounts.reduce((s, t) => s + t.amount, 0),
      paidAmount: paid,
      unpaidAmount: totalEarned - paid,
    };
  }

  /** Cash out all unpaid payable commissions into a batch. */
  async cashout(partnerId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const unpaid = await tx.referralTransaction.findMany({
        where: {
          referralPartnerId: partnerId,
          payableToPartner: true,
          appliedAsDiscount: false,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      if (!unpaid.length) throw new BadRequestException("Nothing to cash out");
      const amount = unpaid.reduce((s, t) => s + t.amount, 0);
      const dates = unpaid.map((t) => t.createdAt.getTime());
      const batch = await tx.cashoutBatch.create({
        data: {
          payeeType: "REFERRAL_PARTNER",
          payeeId: partnerId,
          amount,
          periodStart: new Date(Math.min(...dates)),
          periodEnd: new Date(Math.max(...dates)),
          status: "PAID",
          createdById: user.userId,
          approvedById: user.userId,
          paidAt: new Date(),
        },
      });
      await tx.referralTransaction.updateMany({
        where: { id: { in: unpaid.map((t) => t.id) } },
        data: { status: "PAID", cashoutBatchId: batch.id },
      });
      await this.audit.log(
        user,
        {
          action: "referral.cashout",
          module: "referrals",
          objectType: "cashout_batch",
          objectId: batch.id,
          newValues: { partnerId, amount, transactions: unpaid.length },
          ...meta,
        },
        tx,
      );
      return batch;
    });
  }
}
