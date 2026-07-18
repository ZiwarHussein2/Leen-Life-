import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@leen-life/database";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../prisma.service";

export interface AuditEntry {
  action: string; // e.g. "invoice.create"
  module: string; // e.g. "invoices"
  objectType?: string;
  objectId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  success?: boolean;
  reason?: string;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  location?: string | null;
}

/**
 * Central audit writer (spec §22.4). Every sensitive action calls this;
 * the audit_logs table is append-only (DB trigger). Audit writes must
 * never break the business operation, but failures are loudly logged.
 *
 * When a Prisma transaction client is supplied, the audit row commits
 * atomically with the business mutation.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    user: AuthenticatedUser | null,
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const data = {
      userId: user?.userId ?? null,
      roleKey: user?.roleKey ?? null,
      branchId: user?.branchId ?? null,
      departmentId: user?.departmentId ?? null,
      action: entry.action,
      module: entry.module,
      objectType: entry.objectType ?? null,
      objectId: entry.objectId ?? null,
      oldValues: entry.oldValues === undefined ? undefined : (entry.oldValues as object),
      newValues: entry.newValues === undefined ? undefined : (entry.newValues as object),
      ipAddress: entry.ipAddress ?? null,
      deviceInfo: entry.deviceInfo ?? null,
      location: entry.location ?? null,
      success: entry.success ?? true,
      reason: entry.reason ?? null,
    };
    if (tx) {
      // Inside a transaction the audit row must commit with the mutation.
      await client.auditLog.create({ data });
      return;
    }
    try {
      await client.auditLog.create({ data });
    } catch (err) {
      this.logger.error(`AUDIT WRITE FAILED for ${entry.action}: ${String(err)}`);
    }
  }
}
