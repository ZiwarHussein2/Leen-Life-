import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { ReferralsService } from "./referrals.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreatePartnerDto {
  @IsString() @MaxLength(200) name!: string;
  @IsIn(["DOCTOR", "CLINIC", "HOSPITAL", "OTHER"]) type!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}

class CreateDealDto {
  @IsIn(["FIXED_PER_PATIENT", "PERCENTAGE", "NO_COMMISSION", "DISCOUNT_TO_PATIENT", "CUSTOM"])
  dealType!: string;
  @IsOptional() @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsOptional() @IsBoolean() appliesAsDiscount?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@ApiTags("referrals")
@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("partners")
  @RequirePermissions("referrals.read")
  partners(@Query("q") q?: string) {
    return this.referrals.listPartners(q);
  }

  @Post("partners")
  @RequirePermissions("referrals.manage")
  createPartner(@Body() dto: CreatePartnerDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.referrals.createPartner(dto, user, requestMeta(req));
  }

  /** New deals supersede old ones; historical transactions keep their snapshot. */
  @Post("partners/:id/deals")
  @RequirePermissions("referrals.manage")
  createDeal(
    @Param("id") partnerId: string,
    @Body() dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.referrals.createDeal(partnerId, dto, user, requestMeta(req));
  }

  @Get("partners/:id/balance")
  @RequirePermissions("referrals.read")
  balance(@Param("id") partnerId: string) {
    return this.referrals.partnerBalance(partnerId);
  }

  @Post("partners/:id/cashout")
  @RequirePermissions("referrals.settle")
  cashout(
    @Param("id") partnerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.referrals.cashout(partnerId, user, requestMeta(req));
  }
}
