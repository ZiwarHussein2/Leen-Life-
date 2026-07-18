import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { hasZipMagic, isUnsafeEntryPath, validateZipFile } from "../src/domain/zip-safety";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zip-test-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Build a minimal valid ZIP with one stored (uncompressed) entry. */
function buildZip(entryName: string, content: Buffer, opts?: { lieUncompressedSize?: number }): Buffer {
  const nameBuf = Buffer.from(entryName);
  const crc = crc32(content);
  const uncompressedSize = opts?.lieUncompressedSize ?? content.length;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method: stored
  local.writeUInt32LE(0, 10); // dos time/date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18); // compressed
  local.writeUInt32LE(uncompressedSize, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const localBlock = Buffer.concat([local, nameBuf, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10); // method
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(uncompressedSize, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 36);
  central.writeUInt32LE(0, 42); // local header offset
  const centralBlock = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

describe("ZIP safety (spec §22.5)", () => {
  it("detects the ZIP magic bytes", () => {
    expect(hasZipMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(hasZipMagic(Buffer.from("MZ\x00\x00"))).toBe(false);
  });

  it("rejects traversal and absolute entry paths", () => {
    expect(isUnsafeEntryPath("../evil.dll")).toBe(true);
    expect(isUnsafeEntryPath("/etc/passwd")).toBe(true);
    expect(isUnsafeEntryPath("C:\\windows\\system32\\x")).toBe(true);
    expect(isUnsafeEntryPath("scans/image1.dcm")).toBe(false);
  });

  it("accepts a normal safe ZIP", async () => {
    const path = join(dir, "safe.zip");
    writeFileSync(path, buildZip("scan/image.dcm", Buffer.from("dicom-data-here")));
    const result = await validateZipFile(path);
    expect(result).toMatchObject({ ok: true, entries: 1 });
  });

  it("rejects a ZIP whose entry path traverses", async () => {
    const path = join(dir, "traversal.zip");
    writeFileSync(path, buildZip("../../evil.sh", Buffer.from("#!/bin/sh")));
    const result = await validateZipFile(path);
    expect(result.ok).toBe(false);
  });

  it("rejects a zip-bomb-style declared decompressed size", async () => {
    const path = join(dir, "bomb.zip");
    // Entry lies: claims 100 GiB uncompressed.
    writeFileSync(path, buildZip("big.bin", Buffer.from("x"), { lieUncompressedSize: 0xffffff00 }));
    const result = await validateZipFile(path, {
      maxEntries: 100,
      maxDecompressedBytes: 1024 * 1024,
      maxCompressionRatio: 1000000000,
    });
    // Rejected either by the declared-size limit or by yauzl's own
    // consistency checks — both outcomes block the bomb.
    expect(result.ok).toBe(false);
  });

  it("rejects non-zip garbage", async () => {
    const path = join(dir, "garbage.zip");
    writeFileSync(path, Buffer.from("this is not a zip"));
    const result = await validateZipFile(path);
    expect(result.ok).toBe(false);
  });
});
