import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { DiscountsService } from "./discounts.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreateDiscountRequestDto {
  @IsString() invoiceId!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsInt() @Min(1) requestedAmount?: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(100) requestedPercentage?: number;
}

class DecideDiscountRequestDto {
  @IsIn(["APPROVED", "REJECTED"]) decision!: "APPROVED" | "REJECTED";
  @IsOptional() @IsInt() @Min(0) approvedAmount?: number;
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}

class CreateDiscountCodeDto {
  @IsString() @MinLength(3) @MaxLength(60) code!: string;
  @IsIn(["FIXED", "PERCENTAGE"]) type!: "FIXED" | "PERCENTAGE";
  @IsInt() @Min(1) value!: number;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() testId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags("discounts")
@Controller("discounts")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  // Reception creates the request; it cannot apply the discount itself.
  @Post("requests")
  @RequirePermissions("discounts.request")
  createRequest(
    @Body() dto: CreateDiscountRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.discounts.createRequest(dto, user, requestMeta(req));
  }

  @Get("requests")
  @RequirePermissions("discounts.approve", "discounts.request")
  listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
  ) {
    return this.discounts.listRequests(user, status, Number(page), Math.min(Number(pageSize), 100));
  }

  // Only admin/accounting decide.
  @Post("requests/:id/decision")
  @RequirePermissions("discounts.approve")
  decide(
    @Param("id") id: string,
    @Body() dto: DecideDiscountRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.discounts.decideRequest(id, dto, user, requestMeta(req));
  }

  @Get("codes")
  @RequirePermissions("discounts.codes.manage", "discounts.codes.apply")
  listCodes(@Query("active") active?: string) {
    return this.discounts.listCodes(active === undefined ? undefined : active === "true");
  }

  @Post("codes")
  @RequirePermissions("discounts.codes.manage")
  createCode(
    @Body() dto: CreateDiscountCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.discounts.createCode(dto, user, requestMeta(req));
  }
}
