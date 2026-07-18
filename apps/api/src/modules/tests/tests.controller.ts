import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { TestsService } from "./tests.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreateTestDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() departmentId!: string;
  @IsString() @MaxLength(200) nameEn!: string;
  @IsString() @MaxLength(200) nameAr!: string;
  @IsString() @MaxLength(200) nameKu!: string;
  @IsInt() @Min(0) basePrice!: number;
  @IsOptional() @IsBoolean() requiresReportDefault?: boolean;
  @IsOptional() @IsBoolean() discountAllowed?: boolean;
  @IsOptional() @IsBoolean() referralAllowed?: boolean;
  @IsOptional() @IsInt() @Min(1) estimatedMinutes?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class UpdateTestDto {
  @IsOptional() @IsString() @MaxLength(200) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(200) nameAr?: string;
  @IsOptional() @IsString() @MaxLength(200) nameKu?: string;
  @IsOptional() @IsInt() @Min(0) basePrice?: number;
  @IsOptional() @IsBoolean() requiresReportDefault?: boolean;
  @IsOptional() @IsBoolean() discountAllowed?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreateTimePriceRuleDto {
  @IsString() testId!: string;
  @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @IsInt() @Min(0) price!: number;
}

@ApiTags("services")
@Controller("services")
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Get()
  @RequirePermissions("pricing.read")
  list(@Query("departmentId") departmentId?: string, @Query("active") active?: string) {
    return this.tests.list(departmentId, active === undefined ? undefined : active === "true");
  }

  @Post()
  @RequirePermissions("pricing.manage")
  create(@Body() dto: CreateTestDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.tests.create(dto, user, requestMeta(req));
  }

  @Patch(":id")
  @RequirePermissions("pricing.manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.tests.update(id, dto, user, requestMeta(req));
  }

  @Post("time-price-rules")
  @RequirePermissions("pricing.manage")
  createRule(
    @Body() dto: CreateTimePriceRuleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.tests.createTimePriceRule(dto, user, requestMeta(req));
  }

  @Get(":id/price")
  @RequirePermissions("pricing.read")
  currentPrice(@Param("id") id: string, @Query("at") at?: string) {
    return this.tests.currentPrice(id, at ? new Date(at) : new Date());
  }
}
