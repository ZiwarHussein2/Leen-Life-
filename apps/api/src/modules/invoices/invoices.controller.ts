import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { InvoicesService } from "./invoices.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class InvoiceItemDto {
  @IsString() testId!: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

class CreateInvoiceDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() referralPartnerId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}

class ApplyCodeDto {
  @IsString() @MaxLength(60) code!: string;
}

class RecordPaymentDto {
  @IsInt() @Min(1) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@ApiTags("invoices")
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions("invoices.read")
  list(
    @Query("patientId") patientId?: string,
    @Query("status") status?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
  ) {
    return this.invoices.list({
      patientId,
      status,
      paymentStatus,
      page: Number(page),
      pageSize: Math.min(Number(pageSize), 100),
    });
  }

  @Get(":id")
  @RequirePermissions("invoices.read")
  get(@Param("id") id: string) {
    return this.invoices.getById(id);
  }

  @Get(":id/receipt")
  @RequirePermissions("invoices.read")
  receipt(@Param("id") id: string) {
    return this.invoices.receiptData(id);
  }

  @Post()
  @RequirePermissions("invoices.create")
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.invoices.create(dto, user, requestMeta(req));
  }

  @Post(":id/apply-code")
  @RequirePermissions("discounts.codes.apply")
  applyCode(
    @Param("id") id: string,
    @Body() dto: ApplyCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.invoices.applyDiscountCode(id, dto.code, user, requestMeta(req));
  }

  @Post(":id/finalize")
  @RequirePermissions("invoices.finalize")
  finalize(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.invoices.finalize(id, user, requestMeta(req));
  }

  @Post(":id/payments")
  @RequirePermissions("payments.create")
  pay(
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.invoices.recordPayment(id, dto, user, requestMeta(req));
  }
}
