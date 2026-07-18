/**
 * Background job implementations (spec §26). Each job is a pure-ish
 * function over the database so it can be tested and run either by the
 * BullMQ scheduler (main.ts) or manually via CLI.
 */
import { PrismaClient } from "@leen-life/database";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage-data");

/**
 * Job 1 (spec §26.1): delete scan files past their retention date unless
 * marked Keep. Every deletion is recorded on the file row and audited.
 */
export async function fileRetentionSweep(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.storedFile.findMany({
    where: {
      keepFile: false,
      deletedFromStorageAt: null,
      autoDeleteAfter: { lte: now },
      deletedAt: null,
    },
    take: 500,
  });
  let deleted = 0;
  for (const file of due) {
    try {
      await unlink(join(STORAGE_DIR, file.storagePath)).catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });
      await prisma.$transaction([
        prisma.storedFile.update({
          where: { id: file.id },
          data: { deletedFromStorageAt: now },
        }),
        prisma.fileAccessLog.create({
          data: { fileId: file.id, userId: file.uploadedById, action: "DELETE" },
        }),
        prisma.auditLog.create({
          data: {
            action: "file.retention.delete",
            module: "files",
            objectType: "file",
            objectId: file.id,
            reason: `Retention sweep: past ${file.autoDeleteAfter?.toISOString()}`,
            newValues: { deletedFromStorageAt: now },
          },
        }),
      ]);
      deleted++;
    } catch (err) {
      console.error(`retention: failed to delete ${file.id}:`, err);
    }
  }
  return deleted;
}

/**
 * Jobs 2-3: deliver queued notifications. In dev mode messages are
 * marked sent and logged; production wires Resend (email) and the
 * Telegram Bot API using the credentials in the environment.
 */
export async function deliverNotifications(prisma: PrismaClient): Promise<number> {
  const pending = await prisma.notification.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { email: true, telegramChatId: true, language: true } } },
    take: 100,
  });
  let sent = 0;
  for (const n of pending) {
    try {
      if (n.channel === "TELEGRAM") {
        const devMode = process.env.TELEGRAM_DEV_MODE !== "false";
        if (!devMode && process.env.TELEGRAM_BOT_TOKEN && n.user.telegramChatId) {
          // Never include medical files or full patient identity (spec §25.2).
          const text = `Leen Life: ${n.titleKey} — open your report portal for details.`;
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: n.user.telegramChatId, text }),
          });
        } else {
          console.log(`[dev] telegram -> ${n.userId}: ${n.titleKey}`);
        }
      } else if (n.channel === "EMAIL") {
        const devMode = process.env.EMAIL_DEV_MODE !== "false";
        if (!devMode && process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM ?? "Leen Life <no-reply@leenlife.gashtysoft.com>",
              to: n.user.email,
              subject: n.titleKey,
              text: n.bodyKey,
            }),
          });
        } else {
          console.log(`[dev] email -> ${n.user.email}: ${n.titleKey}`);
        }
      }
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`notify: failed ${n.id}:`, err);
      await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED" } });
    }
  }
  return sent;
}

/** Job 6: low-stock alerts become security-alert style admin signals. */
export async function lowStockAlerts(prisma: PrismaClient): Promise<number> {
  const low: { id: string; departmentId: string; inventoryItemId: string; currentQuantity: number; lowStockThreshold: number }[] =
    await prisma.$queryRaw`
      SELECT id, "departmentId", "inventoryItemId", "currentQuantity", "lowStockThreshold"
      FROM department_inventory
      WHERE "currentQuantity" <= "lowStockThreshold"`;
  let created = 0;
  for (const level of low) {
    const existing = await prisma.securityAlert.findFirst({
      where: { type: "low_stock", objectId: level.id, status: "OPEN" },
    });
    if (!existing) {
      await prisma.securityAlert.create({
        data: {
          type: "low_stock",
          severity: "MEDIUM",
          objectType: "department_inventory",
          objectId: level.id,
          details: {
            departmentId: level.departmentId,
            inventoryItemId: level.inventoryItemId,
            currentQuantity: level.currentQuantity,
            threshold: level.lowStockThreshold,
          },
        },
      });
      created++;
    }
  }
  return created;
}

/** Job 8: flag suspicious attendance (rejected geofence attempts). */
export async function suspiciousAttendanceSweep(prisma: PrismaClient, now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 86400000);
  const rejected = await prisma.attendanceRecord.findMany({
    where: { status: "REJECTED_OUT_OF_GEOFENCE", updatedAt: { gte: dayAgo } },
  });
  let created = 0;
  for (const record of rejected) {
    const existing = await prisma.securityAlert.findFirst({
      where: { type: "attendance_geofence_rejected", objectId: record.id },
    });
    if (!existing) {
      await prisma.securityAlert.create({
        data: {
          type: "attendance_geofence_rejected",
          severity: "MEDIUM",
          userId: record.employeeUserId,
          objectType: "attendance_record",
          objectId: record.id,
          details: { workDate: record.workDate, lat: record.checkInLat, lng: record.checkInLng },
        },
      });
      created++;
    }
  }
  return created;
}

/** Job 9: waste/variance anomalies — high extra usage vs recipe. */
export async function wasteAnomalySweep(prisma: PrismaClient, now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 86400000);
  const records = await prisma.assetUsageRecord.findMany({
    where: { updatedAt: { gte: dayAgo }, wasteQuantity: { gt: 0 } },
    include: { item: true },
  });
  let created = 0;
  for (const r of records) {
    // Anomaly rule: waste at least double the expected usage.
    if (r.expectedQuantity > 0 && r.wasteQuantity >= r.expectedQuantity) {
      const existing = await prisma.securityAlert.findFirst({
        where: { type: "waste_anomaly", objectId: r.id },
      });
      if (!existing) {
        await prisma.securityAlert.create({
          data: {
            type: "waste_anomaly",
            severity: "HIGH",
            objectType: "asset_usage_record",
            objectId: r.id,
            details: {
              departmentId: r.departmentId,
              item: r.item.nameEn,
              expected: r.expectedQuantity,
              waste: r.wasteQuantity,
              cost: r.wasteQuantity * r.item.costPerUnit,
            },
          },
        });
        created++;
      }
    }
  }
  return created;
}

/** Job 10: suspicious logins — repeated failures within a window. */
export async function suspiciousLoginSweep(prisma: PrismaClient, now = new Date()): Promise<number> {
  const hourAgo = new Date(now.getTime() - 3600000);
  const failures = await prisma.loginLog.groupBy({
    by: ["email"],
    where: { status: "FAILED", createdAt: { gte: hourAgo } },
    _count: true,
  });
  let created = 0;
  for (const f of failures) {
    if (f._count >= 5 && f.email) {
      const existing = await prisma.securityAlert.findFirst({
        where: { type: "login_bruteforce", details: { path: ["email"], equals: f.email }, status: "OPEN" },
      });
      if (!existing) {
        await prisma.securityAlert.create({
          data: {
            type: "login_bruteforce",
            severity: "HIGH",
            details: { email: f.email, failuresLastHour: f._count },
          },
        });
        created++;
      }
    }
  }
  return created;
}

/** Jobs 4-5, 7: daily summary rollup cached for dashboards. */
export async function dailySummaryJob(prisma: PrismaClient, now = new Date()): Promise<void> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [payments, invoices, waste] = await Promise.all([
    prisma.payment.aggregate({ where: { paidAt: { gte: startOfDay } }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
    prisma.inventoryMovement.aggregate({
      where: { createdAt: { gte: startOfDay }, movementType: { in: ["WASTE", "DAMAGED", "EXPIRED"] } },
      _sum: { totalCost: true },
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      action: "job.daily-summary",
      module: "worker",
      newValues: {
        date: startOfDay.toISOString().slice(0, 10),
        income: payments._sum.amount ?? 0,
        invoices,
        wasteCost: waste._sum.totalCost ?? 0,
      },
    },
  });
}
