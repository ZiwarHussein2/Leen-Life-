import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { AccountingService } from "./accounting.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class SalaryRunDto {
  @IsString() employeeUserId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsInt() @Min(0) baseSalaryOverride?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@ApiTags("accounting")
@Controller("accounting")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  /** Daily/weekly/monthly/annual financial summary (spec §18.5). */
  @Get("summary")
  @RequirePermissions("accounting.reports.read")
  summary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.accounting.financialSummary(from, to);
  }

  @Get("department-profit")
  @RequirePermissions("accounting.reports.read")
  departmentProfit(@Query("from") from?: string, @Query("to") to?: string) {
    return this.accounting.departmentProfit(from, to);
  }

  @Get("report-doctor-balances")
  @RequirePermissions("accounting.cashouts.manage", "accounting.reports.read")
  reportDoctorBalances() {
    return this.accounting.reportDoctorBalances();
  }

  @Post("report-doctors/:userId/cashout")
  @RequirePermissions("accounting.cashouts.manage")
  cashoutReportDoctor(
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.accounting.cashoutReportDoctor(userId, user, requestMeta(req));
  }

  /** Payroll from attendance (spec §18.4). */
  @Post("salaries")
  @RequirePermissions("accounting.salaries.manage")
  runSalary(@Body() dto: SalaryRunDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.accounting.runSalary(dto, user, requestMeta(req));
  }

  @Get("salaries")
  @RequirePermissions("accounting.salaries.manage", "accounting.reports.read")
  salaries(@Query("period") period?: string) {
    return this.accounting.listSalaries();
  }
}
