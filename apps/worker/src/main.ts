/**
 * Leen Life background worker (spec §26).
 *
 * Uses BullMQ repeatable jobs on Redis. Every job is also runnable
 * one-shot via `node dist/main.js --run <jobName>` for operations and
 * integration testing.
 */
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@leen-life/database";
import {
  dailySummaryJob,
  deliverNotifications,
  fileRetentionSweep,
  lowStockAlerts,
  suspiciousAttendanceSweep,
  suspiciousLoginSweep,
  wasteAnomalySweep,
} from "./jobs";

const prisma = new PrismaClient();

const JOBS: Record<string, { every: number; run: () => Promise<unknown> }> = {
  // Delete scan ZIPs after 7 days unless Keep (hourly sweep).
  "file-retention": { every: 3600_000, run: () => fileRetentionSweep(prisma) },
  // Telegram/email delivery (fast loop).
  "deliver-notifications": { every: 15_000, run: () => deliverNotifications(prisma) },
  "low-stock-alerts": { every: 1800_000, run: () => lowStockAlerts(prisma) },
  "suspicious-attendance": { every: 3600_000, run: () => suspiciousAttendanceSweep(prisma) },
  "waste-anomalies": { every: 3600_000, run: () => wasteAnomalySweep(prisma) },
  "suspicious-logins": { every: 900_000, run: () => suspiciousLoginSweep(prisma) },
  "daily-summary": { every: 86_400_000, run: () => dailySummaryJob(prisma) },
};

async function runOnce(jobName: string) {
  const job = JOBS[jobName];
  if (!job) {
    console.error(`Unknown job "${jobName}". Available: ${Object.keys(JOBS).join(", ")}`);
    process.exit(1);
  }
  const result = await job.run();
  console.log(`${jobName}: done`, result ?? "");
  await prisma.$disconnect();
  process.exit(0);
}

async function main() {
  const runIndex = process.argv.indexOf("--run");
  if (runIndex >= 0) {
    await runOnce(process.argv[runIndex + 1]);
    return;
  }

  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue("leenlife-jobs", { connection });

  for (const [name, def] of Object.entries(JOBS)) {
    await queue.upsertJobScheduler(name, { every: def.every }, { name });
  }

  new Worker(
    "leenlife-jobs",
    async (job) => {
      const def = JOBS[job.name];
      if (!def) return;
      const result = await def.run();
      if (result !== undefined && result !== 0) {
        console.log(`[${new Date().toISOString()}] ${job.name}:`, result);
      }
    },
    { connection, concurrency: 2 },
  );

  console.log(`Leen Life worker running with jobs: ${Object.keys(JOBS).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
