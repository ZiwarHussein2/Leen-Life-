import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { ApiTags as _unused } from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PatientsService } from "./patients.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class CreatePatientDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2030)
  yearOfBirth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

class UpdatePatientDto extends CreatePatientDto {}

@ApiTags("patients")
@Controller("patients")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermissions("patients.read")
  search(
    @Query("q") q?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
  ) {
    return this.patients.search(q, Number(page), Math.min(Number(pageSize), 100));
  }

  @Get(":id")
  @RequirePermissions("patients.read")
  get(@Param("id") id: string) {
    return this.patients.getById(id);
  }

  @Post()
  @RequirePermissions("patients.create")
  create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.patients.create(dto, user, requestMeta(req));
  }

  @Patch(":id")
  @RequirePermissions("patients.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.patients.update(id, dto, user, requestMeta(req));
  }
}
