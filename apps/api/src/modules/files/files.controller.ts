import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import type { Response } from "express";
import { RequirePermissions } from "../../auth/permissions.guard";
import { Public } from "../../auth/jwt.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { FilesService } from "./files.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class KeepFlagDto {
  @IsBoolean() keep!: boolean;
}

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post(":id/signed-url")
  @RequirePermissions("files.download.all", "files.download.assigned", "files.upload.own-department")
  signedUrl(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthedRequest) {
    return this.files.issueSignedUrl(id, user, requestMeta(req));
  }

  /**
   * Download via signed token. The token itself carries the authorized
   * user + expiry (HMAC-verified); this is what makes expiring links
   * work for report doctors on any device.
   */
  @Public()
  @Get("download")
  async download(@Query("token") token: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const { file, stream } = await this.files.redeemDownloadToken(token, requestMeta(req));
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    stream.pipe(res);
  }

  @Post(":id/keep")
  @RequirePermissions("files.keep-flag")
  keep(
    @Param("id") id: string,
    @Body() dto: KeepFlagDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.files.setKeepFlag(id, dto.keep, user, requestMeta(req));
  }
}
