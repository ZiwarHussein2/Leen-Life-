import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { Public } from "../../auth/jwt.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { EmployeesService } from "./employees.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class SignupDto {
  @IsString() @MinLength(3) @MaxLength(200) fullName!: string;
  @IsEmail() email!: string;
  @IsString() @MaxLength(30) phone!: string;
  @IsDateString() dob!: string;
  @IsString() @MaxLength(300) address!: string;
  @IsOptional() @IsNumber() locationLat?: number;
  @IsOptional() @IsNumber() locationLng?: number;
}

class ReviewApplicationDto {
  @IsIn(["APPROVED", "REJECTED"]) decision!: "APPROVED" | "REJECTED";
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}

class AssignPositionDto {
  @IsString() employeeUserId!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsString() @MaxLength(120) jobTitle!: string;
  @IsOptional() @IsInt() @Min(0) salary?: number;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) workStartTime?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) workEndTime?: string;
  @IsOptional() @IsString() @MaxLength(60) workDays?: string;
}

class GeoDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}

class AdjustAttendanceDto {
  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsOptional() @IsString() status?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

@ApiTags("employees")
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  /** Public employee portal signup (email OTP handled by Supabase+Resend). */
  @Public()
  @Post("signup")
  signup(@Body() dto: SignupDto, @Req() req: AuthedRequest) {
    return this.employees.signup(dto, requestMeta(req));
  }

  @Get("applications")
  @RequirePermissions("employees.applications.review")
  applications(@Query("status") status?: string) {
    return this.employees.listApplications(status);
  }

  @Post("applications/:id/review")
  @RequirePermissions("employees.applications.review")
  review(
    @Param("id") id: string,
    @Body() dto: ReviewApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.employees.reviewApplication(id, dto, user, requestMeta(req));
  }

  @Post("positions")
  @RequirePermissions("employees.positions.assign")
  assignPosition(
    @Body() dto: AssignPositionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.employees.assignPosition(dto, user, requestMeta(req));
  }

  @Get("me")
  myPortal(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.myPortal(user);
  }

  @Get("policies")
  policies(@CurrentUser() user: AuthenticatedUser, @Query("language") language = "en") {
    return this.employees.activePolicies(language);
  }

  @Post("positions/:id/accept")
  accept(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.employees.acceptPosition(id, user, requestMeta(req));
  }

  @Get("agreements/:id")
  agreement(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employees.agreementDetail(id, user);
  }

  // ── Attendance ──
  @Post("attendance/check-in")
  @RequirePermissions("attendance.self")
  checkIn(@Body() dto: GeoDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.employees.checkIn(dto, user, requestMeta(req));
  }

  @Post("attendance/check-out")
  @RequirePermissions("attendance.self")
  checkOut(@Body() dto: GeoDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.employees.checkOut(dto, user, requestMeta(req));
  }

  @Get("attendance/me")
  @RequirePermissions("attendance.self")
  myAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.myAttendance(user);
  }

  @Get("attendance")
  @RequirePermissions("attendance.read.all")
  allAttendance(@Query("from") from?: string, @Query("to") to?: string) {
    return this.employees.allAttendance(from, to);
  }

  @Post("attendance/:id/adjust")
  @RequirePermissions("attendance.adjust")
  adjust(
    @Param("id") id: string,
    @Body() dto: AdjustAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.employees.adjustAttendance(id, dto, user, requestMeta(req));
  }
}
