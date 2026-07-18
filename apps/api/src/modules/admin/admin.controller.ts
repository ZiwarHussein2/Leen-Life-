import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { AdminService } from "./admin.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(200) fullName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() roleKey!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsIn(["en", "ar", "ku"]) language?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @IsOptional() @IsString() roleKey?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsIn(["ACTIVE", "SUSPENDED", "DISABLED"]) status?: string;
}

@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("dashboard")
  @RequirePermissions("audit.read", "accounting.reports.read")
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.admin.dashboard(user);
  }

  @Get("users")
  @RequirePermissions("users.read")
  users(@Query("q") q?: string) {
    return this.admin.listUsers(q);
  }

  @Post("users")
  @RequirePermissions("users.manage")
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.admin.createUser(dto, user, requestMeta(req));
  }

  @Patch("users/:id")
  @RequirePermissions("users.manage")
  updateUser(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.updateUser(id, dto, user, requestMeta(req));
  }

  @Get("departments")
  @RequirePermissions("users.read", "departments.manage")
  departments() {
    return this.admin.listDepartments();
  }

  @Get("audit-logs")
  @RequirePermissions("audit.read")
  auditLogs(
    @Query("action") action?: string,
    @Query("userId") userId?: string,
    @Query("objectId") objectId?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 50,
  ) {
    return this.admin.auditLogs({ action, userId, objectId }, Number(page), Math.min(Number(pageSize), 200));
  }

  @Get("security-alerts")
  @RequirePermissions("security.alerts.read")
  securityAlerts(@Query("status") status?: string) {
    return this.admin.securityAlerts(status);
  }

  /** Soft-delete restore (spec §22.6). */
  @Post("restore/:objectType/:id")
  @RequirePermissions("soft-delete.restore")
  restore(
    @Param("objectType") objectType: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.restore(objectType, id, user, requestMeta(req));
  }
}
