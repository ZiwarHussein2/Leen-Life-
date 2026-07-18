import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { InventoryService } from "./inventory.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreateItemDto {
  @IsString() @MaxLength(200) nameEn!: string;
  @IsString() @MaxLength(200) nameAr!: string;
  @IsString() @MaxLength(200) nameKu!: string;
  @IsString() @MaxLength(40) unit!: string;
  @IsInt() @Min(0) costPerUnit!: number;
}

class ReceiveStockDto {
  @IsString() departmentId!: string;
  @IsString() inventoryItemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class WasteDto {
  @IsString() departmentId!: string;
  @IsString() inventoryItemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsIn(["WASTE", "DAMAGED", "EXPIRED"]) movementType!: "WASTE" | "DAMAGED" | "EXPIRED";
  @IsString() @MaxLength(500) notes!: string;
}

@ApiTags("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("items")
  @RequirePermissions("inventory.read.all", "inventory.read.own-department", "inventory.manage")
  items() {
    return this.inventory.listItems();
  }

  @Post("items")
  @RequirePermissions("inventory.manage")
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.inventory.createItem(dto, user, requestMeta(req));
  }

  /** Department stock levels; scoped users see only their department. */
  @Get("levels")
  @RequirePermissions("inventory.read.all", "inventory.read.own-department")
  levels(@CurrentUser() user: AuthenticatedUser, @Query("departmentId") departmentId?: string) {
    return this.inventory.levels(user, departmentId);
  }

  @Post("receive")
  @RequirePermissions("inventory.receive")
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.inventory.receiveStock(dto, user, requestMeta(req));
  }

  @Post("waste")
  @RequirePermissions("inventory.receive", "inventory.usage.enter")
  waste(@Body() dto: WasteDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.inventory.recordWaste(dto, user, requestMeta(req));
  }

  @Get("movements")
  @RequirePermissions("inventory.read.all", "inventory.read.own-department")
  movements(
    @CurrentUser() user: AuthenticatedUser,
    @Query("departmentId") departmentId?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 50,
  ) {
    return this.inventory.movements(user, departmentId, Number(page), Math.min(Number(pageSize), 200));
  }

  /** Usage variance report for admin/accounting review (spec §17.4). */
  @Get("variance")
  @RequirePermissions("inventory.usage.review")
  variance(@Query("from") from?: string, @Query("to") to?: string) {
    return this.inventory.varianceReport(from, to);
  }

  @Get("low-stock")
  @RequirePermissions("inventory.read.all", "inventory.usage.review")
  lowStock() {
    return this.inventory.lowStock();
  }
}
