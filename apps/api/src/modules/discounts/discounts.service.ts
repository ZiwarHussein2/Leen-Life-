import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { assertTransition, DISCOUNT_REQUEST_MACHINE } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { computeInvoiceTotals } from "../../domain/pricing";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Reception submits; invoice moves to PENDING_DISCOUNT. */
  async createRequest(
    dto: { invoiceId: string; reason: string; requestedAmount?: number; requestedPercentage?: number },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    if (!dto.requestedAmount && !dto.requestedPercentage) {
      throw new BadRequestException("Provide requestedAmount or requestedPercentage");
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: dto.invoiceId, deletedAt: null },
        include: { discountRequests: { where: { status: "PENDING" } }, items: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status === "FINALIZED" || invoice.status === "CANCELLED") {
        throw new BadRequestException("Invoice can no longer receive discount requests");
      }
      if (invoice.discountRequests.length > 0) {
        throw new ConflictException("A discount request is already pending");
      }
      const request = await tx.discountRequest.create({
        data: {
          invoiceId: dto.invoiceId,
          requestedById: user.userId,
          reason: dto.reason,
          requestedAmount: dto.requestedAmount ?? null,
          requestedPercentage: dto.requestedPercentage ?? null,
        },
      });
      await tx.invoice.update({ where: { id: dto.invoiceId }, data: { status: "PENDING_DISCOUNT" } });
      await this.audit.log(
        user,
        {
          action: "discount.request.create",
          module: "discounts",
          objectType: "discount_request",
          objectId: request.id,
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return request;
    });
  }

  async listRequests(user: AuthenticatedUser, status: string | undefined, page: number, pageSize: number) {
    const canApprove = user.permissions.includes("discounts.approve");
    const where = {
      ...(status ? { status: status as any } : {}),
      // Reception sees only its own requests; approvers see all.
      ...(canApprove ? {} : { requestedById: user.userId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.discountRequest.findMany({
        where,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              subtotal: true,
              discountTotal: true,
              netTotal: true,
              patient: { select: { patientCode: true, fullName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.discountRequest.count({ where }),
    ]);
    return { data, page, pageSize, total };
  }

  /** Admin/accounting decision. Approval applies the discount atomically. */
  async decideRequest(
    id: string,
    dto: { decision: "APPROVED" | "REJECTED"; approvedAmount?: number; rejectionReason?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.discountRequest.findUnique({
        where: { id },
        include: { invoice: { include: { items: true } } },
      });
      if (!request) throw new NotFoundException("Discount request not found");
      assertTransition("discountRequest", DISCOUNT_REQUEST_MACHINE, request.status, dto.decision);

      if (dto.decision === "REJECTED") {
        const updated = await tx.discountRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            approvedById: user.userId,
            approvedAt: new Date(),
            rejectionReason: dto.rejectionReason ?? "Rejected",
          },
        });
        await tx.invoice.update({ where: { id: request.invoiceId }, data: { status: "DRAFT" } });
        await this.audit.log(
          user,
          {
            action: "discount.request.reject",
            module: "discounts",
            objectType: "discount_request",
            objectId: id,
            oldValues: { status: request.status },
            newValues: { status: "REJECTED", reason: dto.rejectionReason },
            ...meta,
          },
          tx,
        );
        return updated;
      }

      const invoice = request.invoice;
      const amount =
        dto.approvedAmount ??
        request.requestedAmount ??
        Math.floor((invoice.subtotal * (request.requestedPercentage ?? 0)) / 100);
      if (amount <= 0) throw new BadRequestException("Approved amount must be positive");
      if (amount > invoice.subtotal - invoice.discountTotal) {
        throw new BadRequestException("Discount exceeds remaining invoice value");
      }

      const updated = await tx.discountRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: user.userId,
          approvedAt: new Date(),
          approvedAmount: amount,
        },
      });
      const totals = computeInvoiceTotals(
        invoice.items.map((i) => ({ finalPrice: i.finalPrice, quantity: i.quantity, discountAmount: i.discountAmount })),
        invoice.discountTotal + amount,
      );
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { ...totals, status: "DRAFT" },
      });
      await this.audit.log(
        user,
        {
          action: "discount.request.approve",
          module: "discounts",
          objectType: "discount_request",
          objectId: id,
          oldValues: { discountTotal: invoice.discountTotal, netTotal: invoice.netTotal },
          newValues: { approvedAmount: amount, ...totals },
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  listCodes(active?: boolean) {
    return this.prisma.discountCode.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { createdAt: "desc" },
    });
  }

  async createCode(dto: any, user: AuthenticatedUser, meta: Meta) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException("endDate must be after startDate");
    if (dto.type === "PERCENTAGE" && dto.value > 100) {
      throw new BadRequestException("Percentage cannot exceed 100");
    }
    return this.prisma.$transaction(async (tx) => {
      const code = await tx.discountCode.create({
        data: {
          code: dto.code.toUpperCase(),
          type: dto.type,
          value: dto.value,
          startDate: start,
          endDate: end,
          usageLimit: dto.usageLimit ?? null,
          departmentId: dto.departmentId ?? null,
          testId: dto.testId ?? null,
          active: dto.active ?? true,
          createdById: user.userId,
        },
      });
      await this.audit.log(
        user,
        {
          action: "discount.code.create",
          module: "discounts",
          objectType: "discount_code",
          objectId: code.id,
          newValues: { code: code.code, type: code.type, value: code.value },
          ...meta,
        },
        tx,
      );
      return code;
    });
  }
}
