import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { StorageService } from "./storage.service";
import {
  buildStorageKey,
  computeAutoDeleteAfter,
  sanitizeFilename,
  signDownloadToken,
  verifyDownloadToken,
} from "../../domain/files";
import { validateZipFile, hasZipMagic } from "../../domain/zip-safety";
import { readFileSync } from "node:fs";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

const SIGNING_SECRET = () => process.env.FILE_SIGNING_SECRET ?? process.env.AUTH_DEV_JWT_SECRET ?? "file-signing-dev-secret";

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Register an uploaded temp file: validate (type, size, ZIP safety),
   * move into private storage under a randomized key, and record it with
   * the 7-day auto-delete date (spec §3.5, §13, §22.5).
   */
  async ingestUpload(
    tempPath: string,
    originalName: string,
    mimeType: string,
    fileType: "SCAN_ZIP" | "ID_CARD" | "CONTRACT_PDF" | "REPORT_PDF" | "RECEIPT_PDF" | "OTHER",
    owner: { ownerType: string; ownerId?: string; scanOperationId?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    const info = await stat(tempPath);
    const maxBytes = Number(process.env.FILE_MAX_UPLOAD_MB ?? 2048) * 1024 * 1024;
    if (info.size > maxBytes) {
      throw new BadRequestException(`File exceeds the ${process.env.FILE_MAX_UPLOAD_MB ?? 2048}MB limit`);
    }
    if (info.size === 0) throw new BadRequestException("Empty file");

    let scanStatus: "PENDING" | "CLEAN" | "REJECTED" = "PENDING";
    if (fileType === "SCAN_ZIP") {
      const head = Buffer.alloc(4);
      const fd = readFileSync(tempPath).subarray(0, 4);
      fd.copy(head);
      if (!hasZipMagic(head)) throw new BadRequestException("File is not a ZIP archive");
      const result = await validateZipFile(tempPath, {
        maxEntries: Number(process.env.ZIP_MAX_ENTRIES ?? 10000),
        maxDecompressedBytes: Number(process.env.ZIP_MAX_DECOMPRESSED_MB ?? 8192) * 1024 * 1024,
        maxCompressionRatio: 200,
      });
      if (!result.ok) throw new BadRequestException(`ZIP rejected: ${result.reason}`);
      // Structure validated. A production deployment should also run a
      // malware scanner (e.g. ClamAV) before marking CLEAN — the worker
      // exposes the hook; see docs/SECURITY.md.
      scanStatus = "CLEAN";
    } else {
      scanStatus = "CLEAN";
    }

    const fileId = randomUUID();
    const storageKey = buildStorageKey(fileId, fileType.toLowerCase());
    await this.storage.moveIntoStorage(tempPath, storageKey);

    const now = new Date();
    const retentionDays = Number(process.env.FILE_RETENTION_DAYS ?? 7);
    const stored = await this.prisma.$transaction(async (tx) => {
      const file = await tx.storedFile.create({
        data: {
          id: fileId,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId ?? null,
          scanOperationId: owner.scanOperationId ?? null,
          fileType,
          originalName: sanitizeFilename(originalName),
          storagePath: storageKey,
          mimeType,
          sizeBytes: BigInt(info.size),
          uploadedById: user.userId,
          scanStatus,
          // Only scan ZIPs auto-delete; documents (contracts, reports) are records.
          autoDeleteAfter: fileType === "SCAN_ZIP" ? computeAutoDeleteAfter(now, false, retentionDays) : null,
        },
      });
      await tx.fileAccessLog.create({
        data: { fileId, userId: user.userId, action: "UPLOAD", ipAddress: meta.ipAddress, deviceInfo: meta.deviceInfo },
      });
      await this.audit.log(
        user,
        {
          action: "file.upload",
          module: "files",
          objectType: "file",
          objectId: fileId,
          newValues: { originalName, fileType, sizeBytes: info.size },
          ...meta,
        },
        tx,
      );
      return file;
    });
    return stored;
  }

  /**
   * Object-level authorization for file access (spec §22.1): admins with
   * files.download.all pass; report doctors need an active assignment on
   * the case; department users need department match.
   */
  async assertCanAccess(user: AuthenticatedUser, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { scanOperation: true },
    });
    if (!file) throw new NotFoundException("File not found");
    if (file.deletedFromStorageAt) throw new NotFoundException("File no longer stored");

    if (user.permissions.includes("files.download.all")) return file;

    if (user.permissions.includes("files.download.assigned")) {
      // Report doctor: must hold an active assignment for the case.
      if (file.scanOperation) {
        const assignment = await this.prisma.reportAssignment.findFirst({
          where: {
            invoiceItemId: file.scanOperation.invoiceItemId,
            reportDoctorUserId: user.userId,
            status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] },
          },
        });
        if (assignment) return file;
      }
      throw new ForbiddenException("File is not part of a case assigned to you");
    }

    if (user.permissions.includes("files.upload.own-department")) {
      if (file.scanOperation && file.scanOperation.departmentId === user.departmentId) {
        return file;
      }
      throw new ForbiddenException("File belongs to another department");
    }

    throw new ForbiddenException("No file access permission");
  }

  /** Issue a short-lived signed download link. */
  async issueSignedUrl(fileId: string, user: AuthenticatedUser, meta: Meta) {
    const file = await this.assertCanAccess(user, fileId);
    const expirySeconds = Number(process.env.SIGNED_URL_EXPIRY_SECONDS ?? 900);
    const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;
    const token = signDownloadToken(file.id, user.userId, expiresAt, SIGNING_SECRET());
    await this.prisma.fileAccessLog.create({
      data: { fileId, userId: user.userId, action: "SIGNED_LINK_ISSUED", ipAddress: meta.ipAddress, deviceInfo: meta.deviceInfo },
    });
    return {
      url: `/api/v1/files/download?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAt * 1000),
    };
  }

  /** Redeem a signed token (link expiry enforced in the token itself). */
  async redeemDownloadToken(token: string, meta: Meta) {
    const parsed = verifyDownloadToken(token, SIGNING_SECRET(), new Date());
    if (!parsed) throw new ForbiddenException("Invalid or expired download link");
    const file = await this.prisma.storedFile.findFirst({
      where: { id: parsed.fileId, deletedAt: null },
    });
    if (!file || file.deletedFromStorageAt) throw new NotFoundException("File not found");
    await this.prisma.fileAccessLog.create({
      data: {
        fileId: file.id,
        userId: parsed.userId,
        action: "DOWNLOAD",
        ipAddress: meta.ipAddress,
        deviceInfo: meta.deviceInfo,
      },
    });
    return { file, stream: this.storage.createReadStream(file.storagePath) };
  }

  /** Toggle the Keep flag (spec §3.5): kept files never auto-delete. */
  async setKeepFlag(fileId: string, keep: boolean, user: AuthenticatedUser, meta: Meta) {
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) throw new NotFoundException("File not found");
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.storedFile.update({
        where: { id: fileId },
        data: {
          keepFile: keep,
          autoDeleteAfter: keep
            ? null
            : computeAutoDeleteAfter(file.createdAt, false, Number(process.env.FILE_RETENTION_DAYS ?? 7)),
        },
      });
      await tx.fileAccessLog.create({
        data: {
          fileId,
          userId: user.userId,
          action: keep ? "KEEP_FLAG_SET" : "KEEP_FLAG_UNSET",
          ipAddress: meta.ipAddress,
          deviceInfo: meta.deviceInfo,
        },
      });
      await this.audit.log(
        user,
        {
          action: keep ? "file.keep.set" : "file.keep.unset",
          module: "files",
          objectType: "file",
          objectId: fileId,
          oldValues: { keepFile: file.keepFile },
          newValues: { keepFile: keep },
          ...meta,
        },
        tx,
      );
      return u;
    });
    return updated;
  }
}
