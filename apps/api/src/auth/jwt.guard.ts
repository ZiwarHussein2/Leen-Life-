import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { jwtVerify } from "jose";
import { PrismaService } from "../prisma.service";
import type { AuthedRequest } from "./auth.types";

export const IS_PUBLIC_KEY = "isPublic";
/** Marks an endpoint as public (no authentication). Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Global authentication guard.
 *
 * Accepts:
 * 1. Supabase-issued JWTs (HS256, SUPABASE_JWT_SECRET) — production path.
 * 2. Local dev tokens (HS256, AUTH_DEV_JWT_SECRET) — only when
 *    AUTH_DEV_MODE=true, for local development and automated tests.
 *
 * After token verification the guard loads the local user row and
 * attaches role, branch, department, and the resolved permission set.
 * Authorization decisions are made against these database-backed values,
 * never against client-supplied claims.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = header.slice(7);

    const payload = await this.verifyToken(token);
    const email = (payload.email as string | undefined)?.toLowerCase();
    const supabaseUserId = payload.sub as string | undefined;

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(supabaseUserId ? [{ supabaseUserId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });

    if (!user) throw new UnauthorizedException("Unknown user");
    if (user.status !== "ACTIVE" && user.role.key !== "EMPLOYEE") {
      throw new ForbiddenException("Account is not active");
    }

    // MFA enforcement (spec §22.2): Supabase encodes MFA as aal2.
    const aal = payload.aal as string | undefined;
    const mfaVerified = aal === "aal2" || payload.mfa === true;
    if (user.mfaRequired && !mfaVerified) {
      throw new ForbiddenException("MFA required for this account");
    }

    req.user = {
      userId: user.id,
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      roleKey: user.role.key,
      branchId: user.branchId,
      departmentId: user.departmentId,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
      mfaVerified,
    };
    return true;
  }

  private async verifyToken(token: string): Promise<Record<string, unknown>> {
    const secrets: string[] = [];
    if (process.env.SUPABASE_JWT_SECRET) secrets.push(process.env.SUPABASE_JWT_SECRET);
    if (process.env.AUTH_DEV_MODE === "true" && process.env.AUTH_DEV_JWT_SECRET) {
      secrets.push(process.env.AUTH_DEV_JWT_SECRET);
    }
    for (const secret of secrets) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
        return payload as Record<string, unknown>;
      } catch {
        // try next secret
      }
    }
    throw new UnauthorizedException("Invalid or expired token");
  }
}
