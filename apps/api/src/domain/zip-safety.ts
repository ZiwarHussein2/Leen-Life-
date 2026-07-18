/**
 * ZIP upload validation (spec §22.5): size limits, entry limits,
 * ZIP-bomb protection via declared decompressed size, and path-traversal
 * rejection. Runs before a file is accepted into private storage.
 */
import * as yauzl from "yauzl";

export interface ZipValidationLimits {
  maxEntries: number;
  maxDecompressedBytes: number;
  /** max ratio of decompressed/compressed before treating as a bomb */
  maxCompressionRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipValidationLimits = {
  maxEntries: 10000,
  maxDecompressedBytes: 8 * 1024 * 1024 * 1024, // 8 GiB
  maxCompressionRatio: 200,
};

export type ZipValidationResult =
  | { ok: true; entries: number; declaredDecompressedBytes: number }
  | { ok: false; reason: string };

export function hasZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function isUnsafeEntryPath(fileName: string): boolean {
  if (fileName.includes("..")) return true;
  if (fileName.startsWith("/") || fileName.startsWith("\\")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(fileName)) return true; // windows absolute
  if (fileName.includes("\0")) return true;
  return false;
}

/** Validate a ZIP file on disk without extracting it. */
export function validateZipFile(
  path: string,
  limits: ZipValidationLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipValidationResult> {
  return new Promise((resolve) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({ ok: false, reason: `Not a valid ZIP archive` });
        return;
      }
      let entries = 0;
      let declared = 0;
      let compressed = 0;
      zipfile.on("entry", (entry: yauzl.Entry) => {
        entries += 1;
        if (entries > limits.maxEntries) {
          zipfile.close();
          resolve({ ok: false, reason: `Too many entries (> ${limits.maxEntries})` });
          return;
        }
        if (isUnsafeEntryPath(entry.fileName)) {
          zipfile.close();
          resolve({ ok: false, reason: `Unsafe entry path: ${entry.fileName.slice(0, 80)}` });
          return;
        }
        declared += entry.uncompressedSize;
        compressed += entry.compressedSize;
        if (declared > limits.maxDecompressedBytes) {
          zipfile.close();
          resolve({ ok: false, reason: "Declared decompressed size exceeds limit" });
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        if (compressed > 0 && declared / compressed > limits.maxCompressionRatio) {
          resolve({ ok: false, reason: "Suspicious compression ratio (possible zip bomb)" });
          return;
        }
        resolve({ ok: true, entries, declaredDecompressedBytes: declared });
      });
      zipfile.on("error", () => resolve({ ok: false, reason: "Corrupt ZIP archive" }));
      zipfile.readEntry();
    });
  });
}
