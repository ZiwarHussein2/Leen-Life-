import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { ScansService } from "./scans.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class AssetUsageEntryDto {
  @IsString() inventoryItemId!: string;
  @IsInt() @Min(0) quantity!: number;
}

class EnterAssetUsageDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssetUsageEntryDto)
  entries!: AssetUsageEntryDto[];
}

class VerifyAssetUsageDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssetUsageEntryDto)
  entries!: AssetUsageEntryDto[];
  @IsOptional() @IsString() notes?: string;
}

@ApiTags("scans")
@Controller("scans")
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  /** Operator opens the patient from their department queue. */
  @Post("start/:queueEntryId")
  @RequirePermissions("scans.operate.own-department")
  start(
    @Param("queueEntryId") queueEntryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.scans.start(queueEntryId, user, requestMeta(req));
  }

  @Get(":id")
  @RequirePermissions("scans.operate.own-department", "scans.read.all")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.scans.getById(id, user);
  }

  @Post(":id/upload")
  @RequirePermissions("files.upload.own-department")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: process.env.UPLOAD_TMP_DIR ?? tmpdir(),
        filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
      }),
      limits: { fileSize: Number(process.env.FILE_MAX_UPLOAD_MB ?? 2048) * 1024 * 1024 },
    }),
  )
  async upload(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    return this.scans.uploadResult(id, file, user, requestMeta(req));
  }

  @Post(":id/scan-done")
  @RequirePermissions("scans.operate.own-department")
  scanDone(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.scans.markScanDone(id, user, requestMeta(req));
  }

  @Post(":id/printing-done")
  @RequirePermissions("scans.operate.own-department")
  printingDone(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.scans.markPrintingDone(id, user, requestMeta(req));
  }

  /** Department enters produced asset counts (films/pages/DVDs). */
  @Post(":id/asset-usage")
  @RequirePermissions("inventory.usage.enter")
  enterAssetUsage(
    @Param("id") id: string,
    @Body() dto: EnterAssetUsageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.scans.enterAssetUsage(id, dto.entries, user, requestMeta(req));
  }

  /** Reception verifies physical outputs and confirms/edits counts. */
  @Post(":id/asset-usage/verify")
  @RequirePermissions("inventory.usage.verify")
  verifyAssetUsage(
    @Param("id") id: string,
    @Body() dto: VerifyAssetUsageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.scans.verifyAssetUsage(id, dto.entries, user, requestMeta(req));
  }
}
