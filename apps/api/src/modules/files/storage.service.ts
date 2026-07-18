import { Injectable, Logger } from "@nestjs/common";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { rename, unlink, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";

/**
 * Private file storage. Files are never web-served directly: every read
 * goes through the API's authorization + signed-token checks.
 *
 * Local-disk adapter is the default (development and single-server
 * deployments). For S3/MinIO deployments the same interface is
 * implemented against the object store — see docs/FILE_STORAGE.md.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly baseDir: string;

  constructor() {
    this.baseDir = resolve(process.env.STORAGE_DIR ?? "./storage-data");
    if (!existsSync(this.baseDir)) mkdirSync(this.baseDir, { recursive: true });
  }

  /** Resolve a storage key to an absolute path, refusing traversal. */
  private pathFor(storageKey: string): string {
    const full = resolve(join(this.baseDir, storageKey));
    if (!full.startsWith(this.baseDir)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async moveIntoStorage(tempPath: string, storageKey: string): Promise<void> {
    const dest = this.pathFor(storageKey);
    await mkdir(dirname(dest), { recursive: true });
    await rename(tempPath, dest);
  }

  createReadStream(storageKey: string): Readable {
    return createReadStream(this.pathFor(storageKey));
  }

  async writeBuffer(storageKey: string, data: Buffer): Promise<void> {
    const dest = this.pathFor(storageKey);
    await mkdir(dirname(dest), { recursive: true });
    await new Promise<void>((res, rej) => {
      const ws = createWriteStream(dest);
      ws.on("error", rej);
      ws.on("finish", res);
      ws.end(data);
    });
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(storageKey));
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
      this.logger.warn(`delete: ${storageKey} already gone`);
    }
  }

  exists(storageKey: string): boolean {
    return existsSync(this.pathFor(storageKey));
  }
}
