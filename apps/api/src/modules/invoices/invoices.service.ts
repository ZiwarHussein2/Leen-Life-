import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { assertTransition, INVOICE_MACHINE, INVOICE_ITEM_MACHINE } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { effectivePrice, computeInvoiceTotals } from "../../domain/pricing";
import { computeReferralOutcome, validateDiscountCode, discountCodeAmount } from "../../domain/discounts";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async nextInvoiceNumber(tx: any, now: Date): Promise<string> {
    const day = now.toISOString().slice(0, 10).replace(/-/g, "");
    const counter = await tx.sequenceCounter.upsert({
      where: { key: `invoice:${day}` },
      update: { value: { increment: 1 } },
      create: { key: `invoice:${day}`, value: 1 },
    });
    return `INV-${day}-${String(counter.value).padStart(4, "0")}`;
  }

  async list(params: {
    patientId?: string;
    status?: string;
    paymentStatus?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      deletedAt: null,
      ...(params.patientId ? { patientId: params.patientId } : {}),
      ...(params.status ? { status: params.status as any } : {}),
      ...(params.paymentStatus ? { paymentStatus: params.paymentStatus as any } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { patientCode: true, fullName: true } },
          items: { include: { test: { select: { code: true, nameEn: true, nameAr: true, nameKu: true } } } },
          referralPartner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, page: params.page, pageSize: params.pageSize, total };
  }

  async getById(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: true,
        items: { include: { test: true } },
        payments: true,
        discountRequests: true,
        discountUsages: { include: { discountCode: { select: { code: true } } } },
        referralPartner: { select: { id: true, name: true } },
        referralTransactions: true,
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /**
   * Create a draft invoice with items. Prices are resolved server-side
   * (base price + time-based rules) and snapshotted; the client never
   * supplies a price (spec §11: reception cannot change prices).
   */
  async create(
    dto: { patientId: string; referralPartnerId?: string; items: { testId: string; quantity?: number }[] },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    if (!dto.items.length) throw new BadRequestException("Invoice needs at least one test");
    const now = new Date();

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const tests = await this.prisma.test.findMany({
      where: { id: { in: dto.items.map((i) => i.testId) }, deletedAt: null, active: true },
      include: { timePriceRules: true },
    });
    if (tests.length !== new Set(dto.items.map((i) => i.testId)).size) {
      throw new BadRequestException("One or more tests not found or inactive");
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.nextInvoiceNumber(tx, now);

      const itemRows = dto.items.map((i) => {
        const test = tests.find((t) => t.id === i.testId)!;
        const { price, ruleId } = effectivePrice(test.basePrice, test.timePriceRules, now);
        return {
          testId: test.id,
          departmentId: test.departmentId,
          quantity: i.quantity ?? 1,
          basePrice: test.basePrice,
          finalPrice: price,
          timePriceRuleId: ruleId,
          discountAmount: 0,
          requiresReport: test.requiresReportDefault,
        };
      });
      const totals = computeInvoiceTotals(
        itemRows.map((r) => ({ finalPrice: r.finalPrice, quantity: r.quantity, discountAmount: 0 })),
      );

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          patientId: dto.patientId,
          branchId: user.branchId,
          referralPartnerId: dto.referralPartnerId ?? null,
          ...totals,
          createdById: user.userId,
          items: { create: itemRows },
        },
        include: { items: true },
      });

      // Referral deal snapshot (spec §9): computed and stored at sale
      // time; later deal changes never affect this transaction.
      if (dto.referralPartnerId) {
        const deal = await tx.referralDeal.findFirst({
          where: {
            referralPartnerId: dto.referralPartnerId,
            status: "ACTIVE",
            activeFrom: { lte: now },
            OR: [{ activeTo: null }, { activeTo: { gte: now } }],
          },
          orderBy: { activeFrom: "desc" },
        });
        if (deal) {
          const outcome = computeReferralOutcome(deal, totals.subtotal);
          if (outcome.commission > 0 || deal.dealType === "NO_COMMISSION") {
            await tx.referralTransaction.create({
              data: {
                referralPartnerId: dto.referralPartnerId,
                dealId: deal.id,
                patientId: dto.patientId,
                invoiceId: invoice.id,
                amount: outcome.commission,
                appliedAsDiscount: outcome.appliedAsDiscount,
                payableToPartner: outcome.payableToPartner > 0,
              },
            });
            if (outcome.appliedAsDiscount && outcome.commission > 0) {
              // Referral share becomes a patient discount on the invoice.
              const newTotals = computeInvoiceTotals(
                invoice.items.map((r) => ({
                  finalPrice: r.finalPrice,
                  quantity: r.quantity,
                  discountAmount: r.discountAmount,
                })),
                outcome.commission,
              );
              await tx.invoice.update({ where: { id: invoice.id }, data: newTotals });
            }
          }
        }
      }

      await this.audit.log(
        user,
        {
          action: "invoice.create",
          module: "invoices",
          objectType: "invoice",
          objectId: invoice.id,
          newValues: { invoiceNumber, patientId: dto.patientId, items: itemRows.length, ...totals },
          ...meta,
        },
        tx,
      );
      return tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { items: { include: { test: true } }, referralTransactions: true },
      });
    });
  }

  /** Apply a discount code (permission-gated; validated server-side). */
  async applyDiscountCode(invoiceId: string, code: string, user: AuthenticatedUser, meta: Meta) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { items: true, discountUsages: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status !== "DRAFT" && invoice.status !== "PENDING_DISCOUNT") {
        throw new BadRequestException("Invoice can no longer be modified");
      }
      if (invoice.discountUsages.length > 0) {
        throw new ConflictException("A discount code is already applied");
      }
      const discountCode = await tx.discountCode.findUnique({ where: { code } });
      if (!discountCode) throw new NotFoundException("Discount code not found");

      const verdict = validateDiscountCode(
        discountCode,
        now,
        invoice.items.map((i) => ({ departmentId: i.departmentId, testId: i.testId })),
      );
      if (!verdict.ok) throw new BadRequestException(`Discount code rejected: ${verdict.reason}`);

      const applicableSubtotal = invoice.items
        .filter(
          (i) =>
            (!discountCode.departmentId || i.departmentId === discountCode.departmentId) &&
            (!discountCode.testId || i.testId === discountCode.testId),
        )
        .reduce((s, i) => s + i.finalPrice * i.quantity, 0);
      const amount = discountCodeAmount(discountCode, applicableSubtotal);

      await tx.discountCode.update({
        where: { id: discountCode.id },
        data: { usedCount: { increment: 1 } },
      });
      await tx.discountUsage.create({
        data: {
          discountCodeId: discountCode.id,
          invoiceId,
          usedById: user.userId,
          amount,
        },
      });
      const totals = computeInvoiceTotals(
        invoice.items.map((i) => ({ finalPrice: i.finalPrice, quantity: i.quantity, discountAmount: i.discountAmount })),
        invoice.discountTotal + amount,
      );
      const updated = await tx.invoice.update({ where: { id: invoiceId }, data: totals });
      await this.audit.log(
        user,
        {
          action: "discount.code.apply",
          module: "discounts",
          objectType: "invoice",
          objectId: invoiceId,
          newValues: { code, amount },
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Finalize the invoice: freezes prices, and once paid the patient
   * appears in each relevant department queue.
   */
  async finalize(invoiceId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { items: true, discountRequests: { where: { status: "PENDING" } } },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.discountRequests.length > 0) {
        throw new ConflictException("A discount request is still pending approval");
      }
      assertTransition("invoice", INVOICE_MACHINE, invoice.status, "FINALIZED");
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "FINALIZED" },
      });
      await this.audit.log(
        user,
        { action: "invoice.finalize", module: "invoices", objectType: "invoice", objectId: invoiceId, ...meta },
        tx,
      );
      return updated;
    });
  }

  /**
   * Record a payment. Idempotent via idempotencyKey (spec §33.3). Once
   * fully paid, each radiology item enters its department queue.
   */
  async recordPayment(
    invoiceId: string,
    dto: { amount: number; method?: string; idempotencyKey?: string; notes?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    if (dto.amount <= 0) throw new BadRequestException("Payment amount must be positive");
    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing) {
          // Idempotent replay: return the original result, do not double-charge.
          return { payment: existing, replayed: true };
        }
      }
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { items: true, payments: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status !== "FINALIZED") {
        throw new BadRequestException("Invoice must be finalized before payment");
      }
      const paidSoFar = invoice.payments.reduce((s, p) => s + p.amount, 0);
      if (paidSoFar + dto.amount > invoice.netTotal) {
        throw new BadRequestException(
          `Overpayment: net total ${invoice.netTotal}, already paid ${paidSoFar}`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: dto.amount,
          method: (dto.method as any) ?? "CASH",
          receivedById: user.userId,
          idempotencyKey: dto.idempotencyKey ?? null,
          notes: dto.notes ?? null,
        },
      });

      const totalPaid = paidSoFar + dto.amount;
      const paymentStatus = totalPaid >= invoice.netTotal ? "PAID" : "PARTIAL";
      await tx.invoice.update({ where: { id: invoiceId }, data: { paymentStatus } });

      // Fully paid → enqueue radiology items in their department queues.
      if (paymentStatus === "PAID") {
        const today = new Date();
        const queueDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        for (const item of invoice.items) {
          if (item.status !== "PENDING") continue;
          const last = await tx.queueEntry.findFirst({
            where: { departmentId: item.departmentId, queueDate },
            orderBy: { position: "desc" },
          });
          await tx.queueEntry.create({
            data: {
              branchId: invoice.branchId,
              departmentId: item.departmentId,
              invoiceItemId: item.id,
              patientId: invoice.patientId,
              queueDate,
              position: (last?.position ?? 0) + 1,
            },
          });
          assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, item.status, "IN_QUEUE");
          await tx.invoiceItem.update({ where: { id: item.id }, data: { status: "IN_QUEUE" } });
        }
      }

      await this.audit.log(
        user,
        {
          action: "payment.record",
          module: "payments",
          objectType: "payment",
          objectId: payment.id,
          newValues: { invoiceId, amount: dto.amount, method: dto.method ?? "CASH", paymentStatus },
          ...meta,
        },
        tx,
      );
      return { payment, replayed: false, paymentStatus };
    });
  }

  /** Receipt payload for printing (spec §8.2) — trilingual rendering happens client-side. */
  async receiptData(invoiceId: string) {
    const invoice = await this.getById(invoiceId);
    return {
      branding: "Leen Life Medical Complex",
      invoiceNumber: invoice.invoiceNumber,
      patient: {
        code: invoice.patient.patientCode,
        fullName: invoice.patient.fullName,
        yearOfBirth: invoice.patient.yearOfBirth,
      },
      items: invoice.items.map((i) => ({
        test: { code: i.test.code, nameEn: i.test.nameEn, nameAr: i.test.nameAr, nameKu: i.test.nameKu },
        departmentId: i.departmentId,
        quantity: i.quantity,
        finalPrice: i.finalPrice,
        discountAmount: i.discountAmount,
      })),
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      netTotal: invoice.netTotal,
      paymentStatus: invoice.paymentStatus,
      payments: invoice.payments.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt })),
      issuedAt: new Date(),
    };
  }
}
