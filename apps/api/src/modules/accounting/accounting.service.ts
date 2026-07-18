import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { computePayroll } from "../../domain/attendance";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

const DEFAULT_PAYROLL_RULES = {
  latePerMinute: 100, // IQD
  earlyLeavePerMinute: 100,
  overtimePerMinute: 150,
  absentDayDeduction: 25000,
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return { start, end };
  }

  /** Income, discounts, commissions, inventory cost, waste (spec §18.5). */
  async financialSummary(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const [payments, invoices, referral, movements, reports] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { createdAt: { gte: start, lte: end }, deletedAt: null },
        _sum: { discountTotal: true, subtotal: true, netTotal: true },
        _count: true,
      }),
      this.prisma.referralTransaction.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ["movementType"],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { totalCost: true },
      }),
      this.prisma.report.findMany({
        where: { submittedAt: { gte: start, lte: end } },
        select: { reportPriceApproved: true, reportPriceEntered: true },
      }),
    ]);
    const movementCost = (type: string) =>
      movements.find((m) => m.movementType === type)?._sum.totalCost ?? 0;
    return {
      period: { from: start, to: end },
      income: payments._sum.amount ?? 0,
      paymentsCount: payments._count,
      invoices: invoices._count,
      invoiceSubtotal: invoices._sum.subtotal ?? 0,
      discountTotal: invoices._sum.discountTotal ?? 0,
      netTotal: invoices._sum.netTotal ?? 0,
      referralCommissions: referral._sum.amount ?? 0,
      reportDoctorCost: reports.reduce((s, r) => s + (r.reportPriceApproved ?? r.reportPriceEntered ?? 0), 0),
      inventoryConsumedCost: movementCost("USED_FOR_TEST"),
      wasteCost: movementCost("WASTE") + movementCost("DAMAGED") + movementCost("EXPIRED"),
    };
  }

  /** Profit per department: income minus inventory + report costs. */
  async departmentProfit(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null, type: { in: ["SONAR", "MRI", "CT", "XRAY", "MAMMOGRAPHY", "DEXA"] } },
      select: { id: true, name: true, type: true },
    });
    const results = [];
    for (const dept of departments) {
      const [income, consumed, reports] = await Promise.all([
        this.prisma.invoiceItem.aggregate({
          where: {
            departmentId: dept.id,
            createdAt: { gte: start, lte: end },
            status: { not: "CANCELLED" },
          },
          _sum: { finalPrice: true, discountAmount: true },
          _count: true,
        }),
        this.prisma.inventoryMovement.aggregate({
          where: {
            departmentId: dept.id,
            createdAt: { gte: start, lte: end },
            movementType: { in: ["USED_FOR_TEST", "WASTE", "DAMAGED", "EXPIRED"] },
          },
          _sum: { totalCost: true },
        }),
        this.prisma.report.findMany({
          where: { departmentId: dept.id, submittedAt: { gte: start, lte: end } },
          select: { reportPriceApproved: true, reportPriceEntered: true },
        }),
      ]);
      const grossIncome = (income._sum.finalPrice ?? 0) - (income._sum.discountAmount ?? 0);
      const inventoryCost = consumed._sum.totalCost ?? 0;
      const reportCost = reports.reduce(
        (s, r) => s + (r.reportPriceApproved ?? r.reportPriceEntered ?? 0),
        0,
      );
      results.push({
        department: dept,
        tests: income._count,
        grossIncome,
        inventoryCost,
        reportCost,
        profit: grossIncome - inventoryCost - reportCost,
      });
    }
    return { period: { from: start, to: end }, departments: results };
  }

  async reportDoctorBalances() {
    const doctors = await this.prisma.user.findMany({
      where: { role: { key: "REPORT_DOCTOR" }, deletedAt: null },
      select: { id: true, fullName: true, reportDoctorProfile: { select: { agreedPrice: true } } },
    });
    const results = [];
    for (const doc of doctors) {
      const reports = await this.prisma.report.findMany({
        where: { reportDoctorUserId: doc.id, status: { in: ["SUBMITTED", "PRINTED", "AMENDED"] } },
        select: { reportPriceApproved: true, reportPriceEntered: true, cashoutBatchId: true, priceReviewStatus: true },
      });
      const priceOf = (r: (typeof reports)[number]) => r.reportPriceApproved ?? r.reportPriceEntered ?? 0;
      const total = reports.reduce((s, r) => s + priceOf(r), 0);
      const paid = reports.filter((r) => r.cashoutBatchId).reduce((s, r) => s + priceOf(r), 0);
      results.push({
        doctor: { id: doc.id, fullName: doc.fullName },
        agreedPrice: doc.reportDoctorProfile?.agreedPrice ?? null,
        reportCount: reports.length,
        flaggedCount: reports.filter((r) => r.priceReviewStatus === "FLAGGED").length,
        totalEarned: total,
        paid,
        unpaid: total - paid,
      });
    }
    return results;
  }

  /** Pay out a report doctor's unpaid approved reports as a batch. */
  async cashoutReportDoctor(doctorUserId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const unpaid = await tx.report.findMany({
        where: {
          reportDoctorUserId: doctorUserId,
          status: { in: ["SUBMITTED", "PRINTED", "AMENDED"] },
          cashoutBatchId: null,
          // Flagged prices must be reviewed before payout.
          priceReviewStatus: { in: ["WITHIN_DEAL", "APPROVED", "ADJUSTED"] },
        },
      });
      if (!unpaid.length) throw new BadRequestException("No payable reports (flagged prices need review first)");
      const amount = unpaid.reduce((s, r) => s + (r.reportPriceApproved ?? r.reportPriceEntered ?? 0), 0);
      const dates = unpaid.map((r) => (r.submittedAt ?? r.createdAt).getTime());
      const batch = await tx.cashoutBatch.create({
        data: {
          payeeType: "REPORT_DOCTOR",
          payeeId: doctorUserId,
          amount,
          periodStart: new Date(Math.min(...dates)),
          periodEnd: new Date(Math.max(...dates)),
          status: "PAID",
          createdById: user.userId,
          approvedById: user.userId,
          paidAt: new Date(),
        },
      });
      await tx.report.updateMany({
        where: { id: { in: unpaid.map((r) => r.id) } },
        data: { cashoutBatchId: batch.id },
      });
      await this.audit.log(
        user,
        {
          action: "report-doctor.cashout",
          module: "accounting",
          objectType: "cashout_batch",
          objectId: batch.id,
          newValues: { doctorUserId, amount, reports: unpaid.length },
          ...meta,
        },
        tx,
      );
      return batch;
    });
  }

  /** Salary run from attendance (spec §18.4). */
  async runSalary(
    dto: { employeeUserId: string; periodStart: string; periodEnd: string; baseSalaryOverride?: number; notes?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.employeePosition.findFirst({
        where: { employeeUserId: dto.employeeUserId, status: "ACTIVE" },
      });
      const baseSalary = dto.baseSalaryOverride ?? position?.salary ?? 0;
      if (baseSalary <= 0) throw new BadRequestException("No base salary on record");

      const records = await tx.attendanceRecord.findMany({
        where: { employeeUserId: dto.employeeUserId, workDate: { gte: start, lte: end } },
      });
      const payroll = computePayroll(
        baseSalary,
        records.map((r) => ({
          lateMinutes: r.lateMinutes,
          earlyLeaveMinutes: r.earlyLeaveMinutes,
          overtimeMinutes: r.overtimeMinutes,
          absent: r.status === "ABSENT",
        })),
        DEFAULT_PAYROLL_RULES,
      );
      const salary = await tx.salaryRecord.upsert({
        where: {
          employeeUserId_periodStart_periodEnd: {
            employeeUserId: dto.employeeUserId,
            periodStart: start,
            periodEnd: end,
          },
        },
        update: { baseSalary, ...payroll, notes: dto.notes ?? null },
        create: {
          employeeUserId: dto.employeeUserId,
          periodStart: start,
          periodEnd: end,
          baseSalary,
          ...payroll,
          createdById: user.userId,
          notes: dto.notes ?? null,
        },
      });
      await this.audit.log(
        user,
        {
          action: "salary.run",
          module: "accounting",
          objectType: "salary_record",
          objectId: salary.id,
          newValues: { employeeUserId: dto.employeeUserId, baseSalary, ...payroll },
          ...meta,
        },
        tx,
      );
      return salary;
    });
  }

  listSalaries() {
    return this.prisma.salaryRecord.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  }
}
