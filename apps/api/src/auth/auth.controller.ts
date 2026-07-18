import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsString } from "class-validator";
import { SignJWT } from "jose";
import { Public } from "./jwt.guard";
import { CurrentUser } from "./current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../audit/audit.service";
import { requestMeta, type AuthedRequest } from "./auth.types";

class DevLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  devPassword!: string;
}

/**
 * Authentication endpoints.
 *
 * Production identity is issued by Supabase Auth (login, signup, OTP,
 * password reset, MFA); the API only verifies those tokens. The
 * /dev-login endpoint exists purely for local development and automated
 * tests and is disabled unless AUTH_DEV_MODE=true.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post("dev-login")
  async devLogin(@Body() dto: DevLoginDto, @Req() req: AuthedRequest) {
    if (process.env.AUTH_DEV_MODE !== "true") {
      throw new ForbiddenException("Dev login is disabled");
    }
    const expected = process.env.AUTH_DEV_PASSWORD ?? "leenlife-dev";
    const meta = requestMeta(req);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || dto.devPassword !== expected) {
      await this.prisma.loginLog.create({
        data: {
          userId: user?.id ?? null,
          email: dto.email.toLowerCase(),
          status: "FAILED",
          reason: "dev-login bad credentials",
          ipAddress: meta.ipAddress,
          userAgent: meta.deviceInfo,
        },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const secret = new TextEncoder().encode(process.env.AUTH_DEV_JWT_SECRET ?? "local-dev-secret-change-me");
    const token = await new SignJWT({
      email: user.email,
      // Dev tokens simulate a completed MFA challenge so MFA-required
      // roles are testable locally.
      mfa: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.supabaseUserId ?? user.id)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(secret);

    await this.prisma.loginLog.create({
      data: {
        userId: user.id,
        email: user.email,
        status: "SUCCESS",
        reason: "dev-login",
        ipAddress: meta.ipAddress,
        userAgent: meta.deviceInfo,
      },
    });

    return { accessToken: token, tokenType: "Bearer", expiresIn: 8 * 3600 };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        language: true,
        status: true,
        mfaRequired: true,
        role: { select: { key: true, name: true } },
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, type: true } },
      },
    });
    return { ...dbUser, permissions: user.permissions };
  }
}
