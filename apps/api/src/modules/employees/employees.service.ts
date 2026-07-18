import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import {
  assertTransition,
  EMPLOYEE_APPLICATION_MACHINE,
  EMPLOYEE_POSITION_MACHINE,
} from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { computeAttendance, isInsideGeofence } from "../../domain/attendance";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Employee self-signup (spec §19.1). Creates a PENDING user with the
   * EMPLOYEE role plus an application; production email verification is
   * handled by Supabase Auth + Resend.
   */
  async signup(
    dto: {
      fullName: string;
      email: string;
      phone: string;
      dob: string;
      address: string;
      locationLat?: number;
      locationLng?: number;
    },
    meta: Meta,
  ) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists");
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: "EMPLOYEE" } });
    const branch = await this.prisma.branch.findFirstOrThrow({ where: { deletedAt: null } });

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: dto.fullName,
          phone: dto.phone,
          roleId: role.id,
          branchId: branch.id,
          status: "PENDING",
        },
      });
      const application = await tx.employeeApplication.create({
        data: {
          userId: user.id,
          fullName: dto.fullName,
          email,
          phone: dto.phone,
          dob: new Date(dto.dob),
          address: dto.address,
          signupIp: meta.ipAddress,
          signupDevice: meta.deviceInfo,
          signupLocation:
            dto.locationLat !== undefined ? `${dto.locationLat},${dto.locationLng}` : null,
        },
      });
      await this.audit.log(
        null,
        {
          action: "employee.signup",
          module: "employees",
          objectType: "employee_application",
          objectId: application.id,
          newValues: { email, fullName: dto.fullName },
          ...meta,
        },
        tx,
      );
      return { userId: user.id, applicationId: application.id, status: application.status };
    });
  }

  listApplications(status?: string) {
    return this.prisma.employeeApplication.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: "desc" },
    });
  }

  /** Admin review (spec §19.2). */
  async reviewApplication(
    id: string,
    dto: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.employeeApplication.findUnique({ where: { id } });
      if (!application) throw new NotFoundException("Application not found");
      assertTransition("employeeApplication", EMPLOYEE_APPLICATION_MACHINE, application.status, dto.decision);
      const updated = await tx.employeeApplication.update({
        where: { id },
        data: {
          status: dto.decision,
          reviewedById: user.userId,
          reviewedAt: new Date(),
          rejectionReason: dto.decision === "REJECTED" ? dto.rejectionReason ?? "Rejected" : null,
        },
      });
      if (dto.decision === "APPROVED") {
        await tx.user.update({ where: { id: application.userId }, data: { status: "ACTIVE" } });
      }
      await tx.notification.create({
        data: {
          userId: application.userId,
          channel: "EMAIL",
          titleKey: `notifications.application.${dto.decision.toLowerCase()}.title`,
          bodyKey: `notifications.application.${dto.decision.toLowerCase()}.body`,
        },
      });
      await this.audit.log(
        user,
        {
          action: `employee.application.${dto.decision.toLowerCase()}`,
          module: "employees",
          objectType: "employee_application",
          objectId: id,
          oldValues: { status: application.status },
          newValues: { status: dto.decision },
          reason: dto.rejectionReason,
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  /** Admin assigns a job (spec §19.3 step 1). */
  async assignPosition(
    dto: {
      employeeUserId: string;
      departmentId?: string;
      jobTitle: string;
      salary?: number;
      workStartTime?: string;
      workEndTime?: string;
      workDays?: string;
    },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({
        where: { id: dto.employeeUserId, deletedAt: null },
        include: { employeeApplication: true },
      });
      if (!employee) throw new NotFoundException("Employee not found");
      if (employee.employeeApplication?.status !== "APPROVED") {
        throw new BadRequestException("Application must be approved first");
      }
      const position = await tx.employeePosition.create({
        data: {
          employeeUserId: dto.employeeUserId,
          branchId: user.branchId,
          departmentId: dto.departmentId ?? null,
          jobTitle: dto.jobTitle,
          salary: dto.salary ?? null,
          workStartTime: dto.workStartTime ?? "08:00",
          workEndTime: dto.workEndTime ?? "16:00",
          workDays: dto.workDays ?? "SUN,MON,TUE,WED,THU",
          assignedById: user.userId,
        },
      });
      await tx.notification.create({
        data: {
          userId: dto.employeeUserId,
          channel: "EMAIL",
          titleKey: "notifications.jobAssigned.title",
          bodyKey: "notifications.jobAssigned.body",
          params: { positionId: position.id, jobTitle: dto.jobTitle },
        },
      });
      await this.audit.log(
        user,
        {
          action: "employee.position.assign",
          module: "employees",
          objectType: "employee_position",
          objectId: position.id,
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return position;
    });
  }

  /** Employee's own view: application status, offers, agreements. */
  async myPortal(user: AuthenticatedUser) {
    const [application, positions, agreements] = await Promise.all([
      this.prisma.employeeApplication.findUnique({ where: { userId: user.userId } }),
      this.prisma.employeePosition.findMany({
        where: { employeeUserId: user.userId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.employeeAgreement.findMany({
        where: { employeeUserId: user.userId },
        select: { id: true, positionId: true, agreedAt: true, policyVersion: true, contractPdfFileId: true },
      }),
    ]);
    return { application, positions, agreements };
  }

  /** Active policies the employee must accept, in their language. */
  async activePolicies(language: string) {
    return this.prisma.workPolicy.findMany({
      where: { active: true, language },
      orderBy: { version: "desc" },
    });
  }

  /**
   * Accept a position (spec §19.3). Stores an immutable snapshot of the
   * exact terms shown; the contract record is generated from this
   * snapshot only — never a different text.
   */
  async acceptPosition(positionId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.employeePosition.findUnique({ where: { id: positionId } });
      if (!position) throw new NotFoundException("Position not found");
      if (position.employeeUserId !== user.userId) {
        throw new ForbiddenException("This offer is not addressed to you");
      }
      assertTransition("employeePosition", EMPLOYEE_POSITION_MACHINE, position.status, "ACCEPTED");

      const employee = await tx.user.findUniqueOrThrow({ where: { id: user.userId } });
      const policies = await tx.workPolicy.findMany({
        where: { active: true, language: employee.language },
        orderBy: { version: "desc" },
      });
      const policyVersion = policies[0]?.version ?? 1;
      const termsSnapshot = JSON.stringify({
        employee: { fullName: employee.fullName, email: employee.email },
        position: {
          jobTitle: position.jobTitle,
          salary: position.salary,
          workStartTime: position.workStartTime,
          workEndTime: position.workEndTime,
          workDays: position.workDays,
          departmentId: position.departmentId,
        },
        policies: policies.map((p) => ({ title: p.title, version: p.version, content: p.content })),
        acceptedAt: new Date().toISOString(),
      });

      const agreement = await tx.employeeAgreement.create({
        data: {
          employeeUserId: user.userId,
          positionId,
          policyVersion,
          termsSnapshot,
          agreedAt: new Date(),
          ipAddress: meta.ipAddress,
          deviceInfo: meta.deviceInfo,
        },
      });
      await tx.employeePosition.update({ where: { id: positionId }, data: { status: "ACCEPTED" } });
      await tx.employeePosition.update({ where: { id: positionId }, data: { status: "ACTIVE" } });
      await this.audit.log(
        user,
        {
          action: "employee.agreement.accept",
          module: "employees",
          objectType: "employee_agreement",
          objectId: agreement.id,
          newValues: { positionId, policyVersion },
          ...meta,
        },
        tx,
      );
      return agreement;
    });
  }

  /** The exact accepted contract, viewable by the employee and admins. */
  async agreementDetail(agreementId: string, user: AuthenticatedUser) {
    const agreement = await this.prisma.employeeAgreement.findUnique({
      where: { id: agreementId },
      include: { position: true, employee: { select: { fullName: true, email: true } } },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    const isOwner = agreement.employeeUserId === user.userId;
    const isAdmin = user.permissions.includes("employees.contracts.read");
    if (!isOwner && !isAdmin) throw new ForbiddenException("Not your agreement");
    return { ...agreement, terms: JSON.parse(agreement.termsSnapshot) };
  }

  /**
   * Geofenced attendance check-in (spec §19.4). Location outside the
   * geofence is rejected and recorded for review.
   */
  async checkIn(
    dto: { lat: number; lng: number },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    const center = {
      lat: Number(process.env.GEOFENCE_LAT ?? 36.1901),
      lng: Number(process.env.GEOFENCE_LNG ?? 44.0091),
    };
    const radius = Number(process.env.GEOFENCE_RADIUS_METERS ?? 150);
    const inside = isInsideGeofence({ lat: dto.lat, lng: dto.lng }, center, radius);

    const today = new Date();
    const workDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({
        where: { employeeUserId_workDate: { employeeUserId: user.userId, workDate } },
      });
      if (existing?.checkInAt && existing.status !== "REJECTED_OUT_OF_GEOFENCE") {
        throw new ConflictException("Already checked in today");
      }

      if (!inside) {
        const rejected = await tx.attendanceRecord.upsert({
          where: { employeeUserId_workDate: { employeeUserId: user.userId, workDate } },
          update: { status: "REJECTED_OUT_OF_GEOFENCE" },
          create: {
            employeeUserId: user.userId,
            workDate,
            status: "REJECTED_OUT_OF_GEOFENCE",
            checkInLat: dto.lat,
            checkInLng: dto.lng,
            checkInIp: meta.ipAddress,
            checkInDevice: meta.deviceInfo,
          },
        });
        await this.audit.log(
          user,
          {
            action: "attendance.checkin.rejected",
            module: "attendance",
            objectType: "attendance_record",
            objectId: rejected.id,
            success: false,
            reason: "Outside geofence",
            newValues: { lat: dto.lat, lng: dto.lng },
            ...meta,
          },
          tx,
        );
        throw new BadRequestException("Check-in rejected: you are outside the Leen Life location");
      }

      const position = await tx.employeePosition.findFirst({
        where: { employeeUserId: user.userId, status: "ACTIVE" },
      });
      const now = new Date();
      const calc = computeAttendance(now, null, {
        startTime: position?.workStartTime ?? "08:00",
        endTime: position?.workEndTime ?? "16:00",
      });
      const record = await tx.attendanceRecord.upsert({
        where: { employeeUserId_workDate: { employeeUserId: user.userId, workDate } },
        update: {
          checkInAt: now,
          checkInLat: dto.lat,
          checkInLng: dto.lng,
          checkInIp: meta.ipAddress,
          checkInDevice: meta.deviceInfo,
          status: calc.lateMinutes > 0 ? "LATE" : "PRESENT",
          lateMinutes: calc.lateMinutes,
        },
        create: {
          employeeUserId: user.userId,
          workDate,
          checkInAt: now,
          checkInLat: dto.lat,
          checkInLng: dto.lng,
          checkInIp: meta.ipAddress,
          checkInDevice: meta.deviceInfo,
          status: calc.lateMinutes > 0 ? "LATE" : "PRESENT",
          lateMinutes: calc.lateMinutes,
        },
      });
      await this.audit.log(
        user,
        {
          action: "attendance.checkin",
          module: "attendance",
          objectType: "attendance_record",
          objectId: record.id,
          newValues: { lat: dto.lat, lng: dto.lng, late: calc.lateMinutes },
          ...meta,
        },
        tx,
      );
      return record;
    });
  }

  async checkOut(dto: { lat: number; lng: number }, user: AuthenticatedUser, meta: Meta) {
    const today = new Date();
    const workDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.findUnique({
        where: { employeeUserId_workDate: { employeeUserId: user.userId, workDate } },
      });
      if (!record?.checkInAt) throw new BadRequestException("Not checked in today");
      if (record.checkOutAt) throw new ConflictException("Already checked out");

      const position = await tx.employeePosition.findFirst({
        where: { employeeUserId: user.userId, status: "ACTIVE" },
      });
      const now = new Date();
      const calc = computeAttendance(record.checkInAt, now, {
        startTime: position?.workStartTime ?? "08:00",
        endTime: position?.workEndTime ?? "16:00",
      });
      const updated = await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          checkOutAt: now,
          checkOutLat: dto.lat,
          checkOutLng: dto.lng,
          checkOutIp: meta.ipAddress,
          checkOutDevice: meta.deviceInfo,
          earlyLeaveMinutes: calc.earlyLeaveMinutes,
          overtimeMinutes: calc.overtimeMinutes,
          status: calc.earlyLeaveMinutes > 0 ? "EARLY_LEAVE" : record.status,
        },
      });
      await this.audit.log(
        user,
        {
          action: "attendance.checkout",
          module: "attendance",
          objectType: "attendance_record",
          objectId: record.id,
          newValues: { overtime: calc.overtimeMinutes, earlyLeave: calc.earlyLeaveMinutes },
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  myAttendance(user: AuthenticatedUser) {
    return this.prisma.attendanceRecord.findMany({
      where: { employeeUserId: user.userId },
      orderBy: { workDate: "desc" },
      take: 60,
    });
  }

  allAttendance(from?: string, to?: string) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        ...(from || to
          ? {
              workDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { employee: { select: { fullName: true, email: true } } },
      orderBy: { workDate: "desc" },
      take: 500,
    });
  }

  /** Manual correction always requires a reason and is audited (spec §19.4). */
  async adjustAttendance(
    id: string,
    dto: { checkInAt?: string; checkOutAt?: string; status?: string; reason: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundException("Attendance record not found");
      const updated = await tx.attendanceRecord.update({
        where: { id },
        data: {
          ...(dto.checkInAt ? { checkInAt: new Date(dto.checkInAt) } : {}),
          ...(dto.checkOutAt ? { checkOutAt: new Date(dto.checkOutAt) } : {}),
          ...(dto.status ? { status: dto.status as any } : {}),
          adminAdjusted: true,
          adjustedById: user.userId,
          adjustmentReason: dto.reason,
        },
      });
      await this.audit.log(
        user,
        {
          action: "attendance.adjust",
          module: "attendance",
          objectType: "attendance_record",
          objectId: id,
          oldValues: { checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, status: record.status },
          newValues: dto,
          reason: dto.reason,
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }
}
