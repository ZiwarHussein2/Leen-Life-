import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@leen-life/permissions";
import type { AuthedRequest } from "./auth.types";

export const PERMISSIONS_KEY = "requiredPermissions";

/**
 * Declares the permissions required for an endpoint. Multiple keys mean
 * "any of" (the user needs at least one). Object-level and
 * department-level checks still happen inside services.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) return false; // public routes never carry RequirePermissions

    const allowed = required.some((p) => user.permissions.includes(p));
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: requires one of [${required.join(", ")}]`,
      );
    }
    return true;
  }
}
