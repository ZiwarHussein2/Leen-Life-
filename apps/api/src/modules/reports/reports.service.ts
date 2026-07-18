import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import {
  assertTransition,
  INVOICE_ITEM_MACHINE,
  REPORT_ASSIGNMENT_MACHINE,
  REPORT_MACHINE,
} from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { isReportPriceWithinDeal } from "../../domain/discounts";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Reception's report-waiting page (spec §14.1). */
  waitingList(user: AuthenticatedUser) {
    return this.prisma.invoiceItem.findMany({
      where: {
        status: "AWAITING_REPORT",
        requiresReport: true,
        invoice: { branchId: user.branchId, deletedAt: null },
      },
      include: {
        test: { select: { code: true, nameEn: true, nameAr: true, nameKu: true } },
        invoice: { select: { invoiceNumber: true, patient: { select: { id: true, patientCode: true, fullName: true } } } },
        scanOperations: { select: { id: true, status: true, files: { where: { deletedAt: null }, select: { id: true, originalName: true } } } },
        reportAssignments: { where: { status: { notIn: ["CANCELLED", "REASSIGNED"] } } },
      },
      orderBy: { updatedAt: "asc" },
    });
  }

  /** Toggle report requirement on a case (spec §14.2) — always audited. */
  async setReportRequired(invoiceItemId: string, required: boolean, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.invoiceItem.findUnique({ where: { id: invoiceItemId } });
      if (!item) throw new NotFoundException("Case not found");
      if (item.status === "COMPLETED" || item.status === "CANCELLED") {
        throw new BadRequestException("Case is closed");
      }
      const updated = await tx.invoiceItem.update({
        where: { id: invoiceItemId },
        data: {
          requiresReport: required,
          // Removing the requirement on a waiting case completes it.
          ...(item.status === "AWAITING_REPORT" && !required ? { status: "COMPLETED" } : {}),
        },
      });
      await this.audit.log(
        user,
        {
          action: "report.required.change",
          module: "reports",
          objectType: "invoice_item",
          objectId: invoiceItemId,
          oldValues: { requiresReport: item.requiresReport },
          newValues: { requiresReport: required },
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  /** Doctors eligible for assignment. */
  listReportDoctors() {
    return this.prisma.user.findMany({
      where: { role: { key: "REPORT_DOCTOR" }, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        fullName: true,
        reportDoctorProfile: { select: { specialty: true, agreedPrice: true, active: true } },
      },
    });
  }

  /**
   * Assign a report doctor (spec §14.3). Queues a Telegram notification
   * (sent by the worker; medical files are never sent via Telegram).
   */
  async assign(invoiceItemId: string, doctorUserId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.invoiceItem.findUnique({
        where: { id: invoiceItemId },
        include: { invoice: true },
      });
      if (!item) throw new NotFoundException("Case not found");
      if (!item.requiresReport) throw new BadRequestException("Case does not require a report");
      if (item.status !== "AWAITING_REPORT") {
        throw new BadRequestException("Case is not awaiting a report");
      }
      const doctor = await tx.user.findFirst({
        where: { id: doctorUserId, role: { key: "REPORT_DOCTOR" }, status: "ACTIVE", deletedAt: null },
      });
      if (!doctor) throw new BadRequestException("Not an active report doctor");

      const existing = await tx.reportAssignment.findFirst({
        where: { invoiceItemId, status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] } },
      });
      if (existing) throw new BadRequestException("Case already has an active assignment");

      const assignment = await tx.reportAssignment.create({
        data: {
          invoiceItemId,
          patientId: item.invoice.patientId,
          departmentId: item.departmentId,
          reportDoctorUserId: doctorUserId,
          assignedById: user.userId,
        },
      });
      assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, item.status, "REPORT_IN_PROGRESS");
      await tx.invoiceItem.update({ where: { id: invoiceItemId }, data: { status: "REPORT_IN_PROGRESS" } });

      // In-app + Telegram notification (worker delivers TELEGRAM rows).
      await tx.notification.create({
        data: {
          userId: doctorUserId,
          channel: "TELEGRAM",
          titleKey: "notifications.reportAssigned.title",
          bodyKey: "notifications.reportAssigned.body",
          params: { assignmentId: assignment.id, department: item.departmentId },
        },
      });
      await this.audit.log(
        user,
        {
          action: "report.assign",
          module: "reports",
          objectType: "report_assignment",
          objectId: assignment.id,
          newValues: { invoiceItemId, doctorUserId },
          ...meta,
        },
        tx,
      );
      return assignment;
    });
  }

  /** Report doctor's own case list — never anyone else's (spec §6.7). */
  myCases(user: AuthenticatedUser, status?: string) {
    return this.prisma.reportAssignment.findMany({
      where: {
        reportDoctorUserId: user.userId,
        ...(status ? { status: status as any } : { status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] } }),
      },
      include: {
        invoiceItem: {
          select: {
            id: true,
            test: { select: { code: true, nameEn: true } },
            scanOperations: {
              select: { id: true, files: { where: { deletedAt: null, deletedFromStorageAt: null }, select: { id: true, originalName: true, sizeBytes: true } } },
            },
          },
        },
        department: { select: { name: true, type: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
  }

  private async assertAssignment(assignmentId: string, user: AuthenticatedUser) {
    const assignment = await this.prisma.reportAssignment.findUnique({
      where: { id: assignmentId },
      include: { invoiceItem: true },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.reportDoctorUserId !== user.userId) {
      throw new ForbiddenException("Case is not assigned to you");
    }
    return assignment;
  }

  /** Case detail for the assigned doctor. Patient data is minimized. */
  async caseDetail(assignmentId: string, user: AuthenticatedUser) {
    const assignment = await this.assertAssignment(assignmentId, user);
    const [patient, report, files] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { id: assignment.patientId },
        select: { patientCode: true, fullName: true, yearOfBirth: true },
      }),
      this.prisma.report.findFirst({ where: { reportAssignmentId: assignmentId } }),
      this.prisma.storedFile.findMany({
        where: {
          scanOperation: { invoiceItemId: assignment.invoiceItemId },
          deletedAt: null,
          deletedFromStorageAt: null,
        },
        select: { id: true, originalName: true, sizeBytes: true, createdAt: true },
      }),
    ]);
    const item = await this.prisma.invoiceItem.findUnique({
      where: { id: assignment.invoiceItemId },
      select: { test: { select: { code: true, nameEn: true } } },
    });
    return { assignment, patient, report, files, test: item?.test };
  }

  /** Save a draft or submit the report (with price entry, spec §14.5-6). */
  async writeReport(
    assignmentId: string,
    dto: { reportText: string; reportPrice?: number; submit: boolean },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await this.assertAssignment(assignmentId, user);
      if (["COMPLETED", "CANCELLED", "REASSIGNED"].includes(assignment.status)) {
        throw new BadRequestException("Assignment is closed");
      }
      let report = await tx.report.findFirst({ where: { reportAssignmentId: assignmentId } });
      if (report && report.status !== "DRAFT" && report.status !== "AMENDED") {
        throw new BadRequestException("Submitted report can only be changed through amendment");
      }

      if (!report) {
        report = await tx.report.create({
          data: {
            reportAssignmentId: assignmentId,
            invoiceItemId: assignment.invoiceItemId,
            patientId: assignment.patientId,
            departmentId: assignment.departmentId,
            reportDoctorUserId: user.userId,
            reportText: dto.reportText,
            reportPriceEntered: dto.reportPrice ?? null,
          },
        });
        assertTransition("reportAssignment", REPORT_ASSIGNMENT_MACHINE, assignment.status, "IN_PROGRESS");
        await tx.reportAssignment.update({ where: { id: assignmentId }, data: { status: "IN_PROGRESS" } });
      } else {
        report = await tx.report.update({
          where: { id: report.id },
          data: { reportText: dto.reportText, reportPriceEntered: dto.reportPrice ?? report.reportPriceEntered },
        });
      }

      if (dto.submit) {
        if (!report.reportPriceEntered) {
          throw new BadRequestException("Report price is required on submission");
        }
        // Price review (spec §14.6): outside the agreed band → flag.
        const profile = await tx.reportDoctorProfile.findUnique({ where: { userId: user.userId } });
        const within =
          profile !== null &&
          isReportPriceWithinDeal(report.reportPriceEntered, profile.agreedPrice, profile.priceTolerance);
        assertTransition("report", REPORT_MACHINE, report.status, "SUBMITTED");
        report = await tx.report.update({
          where: { id: report.id },
          data: {
            status: "SUBMITTED",
            submittedAt: new Date(),
            priceReviewStatus: within ? "WITHIN_DEAL" : "FLAGGED",
            reportPriceApproved: within ? report.reportPriceEntered : null,
          },
        });
        assertTransition("reportAssignment", REPORT_ASSIGNMENT_MACHINE, "IN_PROGRESS", "COMPLETED");
        await tx.reportAssignment.update({
          where: { id: assignmentId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, "REPORT_IN_PROGRESS", "COMPLETED");
        await tx.invoiceItem.update({ where: { id: assignment.invoiceItemId }, data: { status: "COMPLETED" } });
      }

      await this.audit.log(
        user,
        {
          action: dto.submit ? "report.submit" : "report.draft.save",
          module: "reports",
          objectType: "report",
          objectId: report.id,
          newValues: { price: dto.reportPrice, submit: dto.submit },
          ...meta,
        },
        tx,
      );
      return report;
    });
  }

  /** Sonar direct workflow (spec §15): doctor writes and completes in one step. */
  async writeSonarReport(
    queueEntryId: string,
    dto: { reportText: string; submit: boolean },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findUnique({
        where: { id: queueEntryId },
        include: { invoiceItem: true, department: true },
      });
      if (!entry) throw new NotFoundException("Queue entry not found");
      if (entry.department.type !== "SONAR") {
        throw new BadRequestException("Not a sonar case");
      }
      if (entry.departmentId !== user.departmentId) {
        throw new ForbiddenException("Not your department queue");
      }

      let report = await tx.report.findFirst({
        where: { invoiceItemId: entry.invoiceItemId, reportDoctorUserId: user.userId },
      });
      if (report && report.status !== "DRAFT") {
        throw new BadRequestException("Sonar report already submitted");
      }
      if (!report) {
        // Opening the case moves the queue to IN_PROGRESS.
        if (entry.status === "WAITING") {
          await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "IN_PROGRESS" } });
          if (entry.invoiceItem.status === "IN_QUEUE") {
            await tx.invoiceItem.update({ where: { id: entry.invoiceItemId }, data: { status: "IN_PROGRESS" } });
          }
        }
        report = await tx.report.create({
          data: {
            invoiceItemId: entry.invoiceItemId,
            patientId: entry.patientId,
            departmentId: entry.departmentId,
            reportDoctorUserId: user.userId,
            reportText: dto.reportText,
          },
        });
      } else {
        report = await tx.report.update({ where: { id: report.id }, data: { reportText: dto.reportText } });
      }

      if (dto.submit) {
        report = await tx.report.update({
          where: { id: report.id },
          data: { status: "SUBMITTED", submittedAt: new Date() },
        });
        await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "DONE" } });
        await tx.invoiceItem.update({ where: { id: entry.invoiceItemId }, data: { status: "COMPLETED" } });
      }
      await this.audit.log(
        user,
        {
          action: dto.submit ? "report.sonar.submit" : "report.sonar.draft",
          module: "reports",
          objectType: "report",
          objectId: report.id,
          ...meta,
        },
        tx,
      );
      return report;
    });
  }

  /** Completed reports ready for printing at reception. */
  completedReports(user: AuthenticatedUser) {
    return this.prisma.report.findMany({
      where: { status: { in: ["SUBMITTED", "PRINTED"] } },
      include: {
        patient: { select: { patientCode: true, fullName: true } },
        reportDoctor: { select: { fullName: true } },
        department: { select: { name: true, type: true } },
        invoiceItem: { select: { test: { select: { code: true, nameEn: true } } } },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });
  }

  async markPrinted(reportId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: reportId } });
      if (!report) throw new NotFoundException("Report not found");
      assertTransition("report", REPORT_MACHINE, report.status, "PRINTED");
      const updated = await tx.report.update({
        where: { id: reportId },
        data: { status: "PRINTED", printedAt: new Date() },
      });
      await this.audit.log(
        user,
        { action: "report.print", module: "reports", objectType: "report", objectId: reportId, ...meta },
        tx,
      );
      return updated;
    });
  }

  /** Full report payload for printing (QR token included). */
  async printData(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        patient: { select: { patientCode: true, fullName: true, yearOfBirth: true } },
        reportDoctor: { select: { fullName: true } },
        department: { select: { name: true, type: true } },
        invoiceItem: { select: { test: { select: { code: true, nameEn: true, nameAr: true, nameKu: true } } } },
      },
    });
    if (!report) throw new NotFoundException("Report not found");
    const base = process.env.QR_VERIFICATION_BASE_URL ?? "http://localhost:3000/verify";
    return { ...report, qrUrl: `${base}/${report.qrVerificationToken}` };
  }

  /**
   * Public QR verification (spec §16): confirms authenticity with
   * minimal fields; never exposes the medical report body.
   */
  async verifyByToken(token: string) {
    const report = await this.prisma.report.findUnique({
      where: { qrVerificationToken: token },
      include: {
        patient: { select: { patientCode: true, fullName: true } },
        reportDoctor: { select: { fullName: true } },
        department: { select: { name: true } },
        invoiceItem: { select: { test: { select: { nameEn: true } } } },
      },
    });
    if (!report || report.status === "DRAFT") {
      return { verified: false };
    }
    const maskedName = report.patient.fullName
      .split(" ")
      .map((part, i) => (i === 0 ? part : `${part[0]}.`))
      .join(" ");
    return {
      verified: true,
      reportId: report.id,
      patientCode: report.patient.patientCode,
      patientName: maskedName,
      testName: report.invoiceItem.test.nameEn,
      department: report.department.name,
      reportDoctor: report.reportDoctor.fullName,
      reportDate: report.submittedAt,
      branch: "Leen Life Medical Complex, Erbil",
      message: "This report is genuine",
    };
  }

  /** Accounting/admin price review of flagged reports (spec §18.3). */
  async reviewPrice(
    reportId: string,
    dto: { approvedPrice: number; reason: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: reportId } });
      if (!report) throw new NotFoundException("Report not found");
      if (report.status === "DRAFT") throw new BadRequestException("Report not submitted yet");
      const updated = await tx.report.update({
        where: { id: reportId },
        data: {
          reportPriceApproved: dto.approvedPrice,
          priceReviewStatus: dto.approvedPrice === report.reportPriceEntered ? "APPROVED" : "ADJUSTED",
          priceReviewedById: user.userId,
        },
      });
      await tx.reportPriceReview.create({
        data: {
          reportId,
          oldPrice: report.reportPriceApproved ?? report.reportPriceEntered,
          newPrice: dto.approvedPrice,
          reviewedById: user.userId,
          reason: dto.reason,
        },
      });
      await this.audit.log(
        user,
        {
          action: "report.price.review",
          module: "reports",
          objectType: "report",
          objectId: reportId,
          oldValues: { price: report.reportPriceApproved ?? report.reportPriceEntered },
          newValues: { price: dto.approvedPrice },
          reason: dto.reason,
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  /** Report doctor earnings dashboard (spec §14.6). */
  async myEarnings(user: AuthenticatedUser) {
    const reports = await this.prisma.report.findMany({
      where: { reportDoctorUserId: user.userId, status: { in: ["SUBMITTED", "PRINTED", "AMENDED"] } },
      select: { id: true, submittedAt: true, reportPriceApproved: true, reportPriceEntered: true, cashoutBatchId: true },
    });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay.getTime() - startOfDay.getDay() * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const priceOf = (r: (typeof reports)[number]) => r.reportPriceApproved ?? r.reportPriceEntered ?? 0;
    const sumSince = (d: Date) =>
      reports.filter((r) => r.submittedAt && r.submittedAt >= d).reduce((s, r) => s + priceOf(r), 0);
    const total = reports.reduce((s, r) => s + priceOf(r), 0);
    const paid = reports.filter((r) => r.cashoutBatchId).reduce((s, r) => s + priceOf(r), 0);
    const pendingCount = await this.prisma.reportAssignment.count({
      where: { reportDoctorUserId: user.userId, status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] } },
    });
    return {
      pendingReports: pendingCount,
      completedReports: reports.length,
      earnedToday: sumSince(startOfDay),
      earnedThisWeek: sumSince(startOfWeek),
      earnedThisMonth: sumSince(startOfMonth),
      earnedThisYear: sumSince(startOfYear),
      totalEarned: total,
      cashedOut: paid,
      remainingBalance: total - paid,
    };
  }
}
