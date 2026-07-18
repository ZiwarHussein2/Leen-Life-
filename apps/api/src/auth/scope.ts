import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";

/**
 * Department isolation (spec §12.1, §22.3): department-scoped users may
 * only touch objects in their own department. Broad-read permissions
 * (queues.read.all etc.) bypass this at route level, never here.
 */
export function assertSameDepartment(user: AuthenticatedUser, departmentId: string): void {
  if (user.departmentId !== departmentId) {
    throw new ForbiddenException("Object belongs to another department");
  }
}

export function assertSameBranch(user: AuthenticatedUser, branchId: string): void {
  if (user.branchId !== branchId) {
    throw new ForbiddenException("Object belongs to another branch");
  }
}

export function hasPermission(user: AuthenticatedUser, permission: string): boolean {
  return user.permissions.includes(permission);
}
