import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";

/**
 * Aggregation-only queries for the future Merna central platform.
 * Everything returned is a count or a sum — never a person-level row.
 */
@Injectable()
export class MernaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const end = to ? new Date(to) : new Date();
    return { start, end };
  }

  private async logConnectorAccess(endpoint: string, params: unknown) {
    await this.audit.log(null, {
      action: "merna.connector.read",
      module: "merna-connector",
      objectType: "aggregate",
      newValues: { endpoint, params },
    });
  }

  async branchKpis(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    await this.logConnectorAccess("branch-kpis", { from, to });
    const [invoices, payments, patients, reportBacklog, alerts] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { createdAt: { gte: start, lte: end }, deletedAt: null },
        _count: true,
        _sum: { netTotal: true, discountTotal: true },
      }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.patient.count({ where: { createdAt: { gte: start, lte: end }, deletedAt: null } }),
      this.prisma.invoiceItem.count({ where: { status: { in: ["AWAITING_REPORT", "REPORT_IN_PROGRESS"] } } }),
      this.prisma.securityAlert.count({ where: { status: "OPEN" } }),
    ]);
    return {
      branch: "leen-life-erbil",
      period: { from: start, to: end },
      invoices: invoices._count,
      revenue: payments._sum.amount ?? 0,
      netBilled: invoices._sum.netTotal ?? 0,
      discountsGiven: invoices._sum.discountTotal ?? 0,
      newPatients: patients,
      reportBacklog,
      openAlerts: alerts,
    };
  }

  async departmentPerformance(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    await this.logConnectorAccess("department-performance", { from, to });
    const grouped = await this.prisma.invoiceItem.groupBy({
      by: ["departmentId", "status"],
      where: { createdAt: { gte: start, lte: end } },
      _count: true,
      _sum: { finalPrice: true },
    });
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
    });
    return {
      period: { from: start, to: end },
      departments: departments.map((d) => ({
        // Department name/type only — no staff or patient identifiers.
        name: d.name,
        type: d.type,
        tests: grouped.filter((g) => g.departmentId === d.id).reduce((s, g) => s + g._count, 0),
        completed: grouped
          .filter((g) => g.departmentId === d.id && g.status === "COMPLETED")
          .reduce((s, g) => s + g._count, 0),
        billed: grouped.filter((g) => g.departmentId === d.id).reduce((s, g) => s + (g._sum.finalPrice ?? 0), 0),
      })),
    };
  }

  async attendanceSummary(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    await this.logConnectorAccess("attendance-summary", { from, to });
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { workDate: { gte: start, lte: end } },
      _count: true,
    });
    // Aggregate counts only — never employee identities or locations.
    return {
      period: { from: start, to: end },
      byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
    };
  }
}
