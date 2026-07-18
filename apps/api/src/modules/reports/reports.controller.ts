import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { Public } from "../../auth/jwt.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { ReportsService } from "./reports.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class SetReportRequiredDto {
  @IsBoolean() required!: boolean;
}
class AssignDto {
  @IsString() doctorUserId!: string;
}
class WriteReportDto {
  @IsString() @MaxLength(100000) reportText!: string;
  @IsOptional() @IsInt() @Min(0) reportPrice?: number;
  @IsBoolean() submit!: boolean;
}
class WriteSonarReportDto {
  @IsString() @MaxLength(100000) reportText!: string;
  @IsBoolean() submit!: boolean;
}
class ReviewPriceDto {
  @IsInt() @Min(0) approvedPrice!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("waiting")
  @RequirePermissions("reports.assign", "reports.read.all")
  waiting(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.waitingList(user);
  }

  @Post("cases/:invoiceItemId/report-required")
  @RequirePermissions("reports.assign", "pricing.manage")
  setRequired(
    @Param("invoiceItemId") id: string,
    @Body() dto: SetReportRequiredDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.reports.setReportRequired(id, dto.required, user, requestMeta(req));
  }

  @Get("doctors")
  @RequirePermissions("reports.assign")
  doctors() {
    return this.reports.listReportDoctors();
  }

  @Post("cases/:invoiceItemId/assign")
  @RequirePermissions("reports.assign")
  assign(
    @Param("invoiceItemId") id: string,
    @Body() dto: AssignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.reports.assign(id, dto.doctorUserId, user, requestMeta(req));
  }

  // ── Report doctor portal ──
  @Get("my-cases")
  @RequirePermissions("reports.write.assigned")
  myCases(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: string) {
    return this.reports.myCases(user, status);
  }

  @Get("my-cases/:assignmentId")
  @RequirePermissions("reports.write.assigned")
  caseDetail(@Param("assignmentId") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.caseDetail(id, user);
  }

  @Post("my-cases/:assignmentId/write")
  @RequirePermissions("reports.write.assigned")
  write(
    @Param("assignmentId") id: string,
    @Body() dto: WriteReportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.reports.writeReport(id, dto, user, requestMeta(req));
  }

  @Get("my-earnings")
  @RequirePermissions("report-doctor.earnings.read.own")
  earnings(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.myEarnings(user);
  }

  // ── Sonar direct workflow ──
  @Post("sonar/:queueEntryId/write")
  @RequirePermissions("reports.write.sonar")
  sonarWrite(
    @Param("queueEntryId") id: string,
    @Body() dto: WriteSonarReportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.reports.writeSonarReport(id, dto, user, requestMeta(req));
  }

  // ── Printing and review ──
  @Get("completed")
  @RequirePermissions("reports.print", "reports.read.all")
  completed(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.completedReports(user);
  }

  @Get(":id/print-data")
  @RequirePermissions("reports.print", "reports.read.all")
  printData(@Param("id") id: string) {
    return this.reports.printData(id);
  }

  @Post(":id/mark-printed")
  @RequirePermissions("reports.print")
  markPrinted(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.reports.markPrinted(id, user, requestMeta(req));
  }

  @Post(":id/price-review")
  @RequirePermissions("reports.price.review")
  reviewPrice(
    @Param("id") id: string,
    @Body() dto: ReviewPriceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.reports.reviewPrice(id, dto, user, requestMeta(req));
  }

  /** Public QR verification endpoint — minimal, privacy-filtered. */
  @Public()
  @Get("verify/:token")
  verify(@Param("token") token: string) {
    return this.reports.verifyByToken(token);
  }
}
