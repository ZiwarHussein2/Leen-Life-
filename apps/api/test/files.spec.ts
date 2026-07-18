import { describe, expect, it } from "vitest";
import {
  buildStorageKey,
  computeAutoDeleteAfter,
  isEligibleForDeletion,
  sanitizeFilename,
  signDownloadToken,
  verifyDownloadToken,
} from "../src/domain/files";

const DAY = 86400000;

describe("file retention (spec §3.5)", () => {
  const uploaded = new Date("2026-07-18T10:00:00Z");
  it("default deletion date is 7 days after upload", () => {
    expect(computeAutoDeleteAfter(uploaded, false)?.getTime()).toBe(uploaded.getTime() + 7 * DAY);
  });
  it("Keep flag disables auto-deletion", () => {
    expect(computeAutoDeleteAfter(uploaded, true)).toBeNull();
  });
  it("eligibility: only past-due, unkept, not-yet-deleted files", () => {
    const due = new Date(uploaded.getTime() + 7 * DAY);
    const base = { keepFile: false, autoDeleteAfter: due, deletedFromStorageAt: null };
    expect(isEligibleForDeletion(base, new Date(due.getTime() + 1))).toBe(true);
    expect(isEligibleForDeletion(base, new Date(due.getTime() - 1))).toBe(false);
    expect(isEligibleForDeletion({ ...base, keepFile: true }, new Date(due.getTime() + 1))).toBe(false);
    expect(isEligibleForDeletion({ ...base, deletedFromStorageAt: new Date() }, new Date(due.getTime() + 1))).toBe(false);
    expect(isEligibleForDeletion({ ...base, autoDeleteAfter: null }, new Date())).toBe(false);
  });
});

describe("signed download tokens (spec §22.5)", () => {
  const secret = "test-secret";
  it("round-trips a valid token", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signDownloadToken("file-1", "user-1", exp, secret);
    expect(verifyDownloadToken(token, secret, new Date())).toEqual({ fileId: "file-1", userId: "user-1" });
  });
  it("rejects expired tokens", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = signDownloadToken("file-1", "user-1", exp, secret);
    expect(verifyDownloadToken(token, secret, new Date())).toBeNull();
  });
  it("rejects tampered tokens and wrong secrets", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signDownloadToken("file-1", "user-1", exp, secret);
    expect(verifyDownloadToken(token + "x", secret, new Date())).toBeNull();
    expect(verifyDownloadToken(token, "other-secret", new Date())).toBeNull();
    expect(verifyDownloadToken("garbage", secret, new Date())).toBeNull();
  });
});

describe("filename sanitization", () => {
  it("strips traversal and separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a\\b\\evil.zip")).toBe("evil.zip");
  });
  it("keeps Arabic names", () => {
    expect(sanitizeFilename("تقرير.zip")).toBe("تقرير.zip");
  });
  it("rejects reserved/empty names", () => {
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename("con.txt")).toBe("file");
  });
  it("storage keys are derived from server-side ids only", () => {
    expect(buildStorageKey("abcd1234", "scan_zip")).toBe("scan_zip/ab/abcd1234");
  });
});
