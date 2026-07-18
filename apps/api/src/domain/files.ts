/** File lifecycle rules (spec §3.5, §13, §22.5). */

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_RETENTION_DAYS = 7;

/**
 * Compute the automatic deletion timestamp for an uploaded scan file.
 * Files marked Keep never receive an auto-delete date.
 */
export function computeAutoDeleteAfter(
  uploadedAt: Date,
  keepFile: boolean,
  retentionDays = DEFAULT_RETENTION_DAYS,
): Date | null {
  if (keepFile) return null;
  return new Date(uploadedAt.getTime() + retentionDays * 86400000);
}

export function isEligibleForDeletion(
  file: { keepFile: boolean; autoDeleteAfter: Date | null; deletedFromStorageAt: Date | null },
  now: Date,
): boolean {
  if (file.keepFile) return false;
  if (file.deletedFromStorageAt) return false;
  if (!file.autoDeleteAfter) return false;
  return file.autoDeleteAfter <= now;
}

/** HMAC-signed expiring download token for private file access. */
export function signDownloadToken(
  fileId: string,
  userId: string,
  expiresAtEpochSeconds: number,
  secret: string,
): string {
  const payload = `${fileId}.${userId}.${expiresAtEpochSeconds}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyDownloadToken(
  token: string,
  secret: string,
  now: Date,
): { fileId: string; userId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString();
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  const [fileId, userId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!fileId || !userId || Number.isNaN(exp)) return null;
  if (now.getTime() / 1000 > exp) return null;
  return { fileId, userId };
}

/** Randomized server-side storage key: never derived from client input. */
export function buildStorageKey(fileId: string, category: string): string {
  return `${category}/${fileId.slice(0, 2)}/${fileId}`;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Sanitize an original filename for safe storage in metadata. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\-()؀-ۿ ]+/g, "_").slice(0, 200);
  if (!cleaned || cleaned === "." || cleaned === ".." || WINDOWS_RESERVED.test(cleaned)) {
    return "file";
  }
  return cleaned;
}
