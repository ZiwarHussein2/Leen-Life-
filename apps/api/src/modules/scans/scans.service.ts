import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import {
  assertTransition,
  INVOICE_ITEM_MACHINE,
  QUEUE_MACHINE,
  SCAN_MACHINE,
} from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { FilesService } from "../files/files.service";
import { assertSameDepartment } from "../../auth/scope";
import { computeUsageVariance } from "../../domain/inventory";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  /** Operator clicks the patient in their queue: creates the scan case. */
  async start(queueEntryId: string, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findUnique({
        where: { id: queueEntryId },
        include: { invoiceItem: true },
      });
      if (!entry) throw new NotFoundException("Queue entry not found");
      // Department isolation: operators act only on their own queue.
      assertSameDepartment(user, entry.departmentId);
      assertTransition("queue", QUEUE_MACHINE, entry.status, "IN_PROGRESS");
      assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, entry.invoiceItem.status, "IN_PROGRESS");

      await tx.queueEntry.update({ where: { id: queueEntryId }, data: { status: "IN_PROGRESS" } });
      await tx.invoiceItem.update({ where: { id: entry.invoiceItemId }, data: { status: "IN_PROGRESS" } });
      const scan = await tx.scanOperation.create({
        data: {
          invoiceItemId: entry.invoiceItemId,
          departmentId: entry.departmentId,
          patientId: entry.patientId,
          operatorUserId: user.userId,
        },
      });
      await this.audit.log(
        user,
        { action: "scan.start", module: "scans", objectType: "scan_operation", objectId: scan.id, newValues: { queueEntryId }, ...meta },
        tx,
      );
      return scan;
    });
  }

  async getById(id: string, user: AuthenticatedUser) {
    const scan = await this.prisma.scanOperation.findUnique({
      where: { id },
      include: {
        invoiceItem: { include: { test: { include: { assetRecipes: { include: { item: true } } } } } },
        files: { where: { deletedAt: null } },
        assetUsageRecords: { include: { item: true } },
      },
    });
    if (!scan) throw new NotFoundException("Scan not found");
    if (!user.permissions.includes("scans.read.all")) {
      assertSameDepartment(user, scan.departmentId);
    }
    const patient = await this.prisma.patient.findUnique({
      where: { id: scan.patientId },
      select: { id: true, patientCode: true, fullName: true, yearOfBirth: true },
    });
    return { ...scan, patient };
  }

  async uploadResult(scanId: string, file: Express.Multer.File, user: AuthenticatedUser, meta: Meta) {
    const scan = await this.prisma.scanOperation.findUnique({ where: { id: scanId } });
    if (!scan) throw new NotFoundException("Scan not found");
    assertSameDepartment(user, scan.departmentId);
    if (scan.status === "CANCELLED" || scan.status === "COMPLETED") {
      throw new BadRequestException("Scan is closed");
    }
    return this.files.ingestUpload(
      file.path,
      file.originalname,
      file.mimetype || "application/zip",
      "SCAN_ZIP",
      { ownerType: "scan_operation", ownerId: scanId, scanOperationId: scanId },
      user,
      meta,
    );
  }

  async markScanDone(scanId: string, user: AuthenticatedUser, meta: Meta) {
    return this.transitionScan(scanId, "SCAN_DONE", user, meta);
  }

  async markPrintingDone(scanId: string, user: AuthenticatedUser, meta: Meta) {
    return this.transitionScan(scanId, "PRINTING_DONE", user, meta);
  }

  private async transitionScan(
    scanId: string,
    to: "SCAN_DONE" | "PRINTING_DONE",
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const scan = await tx.scanOperation.findUnique({
        where: { id: scanId },
        include: { invoiceItem: true },
      });
      if (!scan) throw new NotFoundException("Scan not found");
      assertSameDepartment(user, scan.departmentId);
      assertTransition("scan", SCAN_MACHINE, scan.status, to);

      const now = new Date();
      const updated = await tx.scanOperation.update({
        where: { id: scanId },
        data: {
          status: to,
          ...(to === "SCAN_DONE" ? { scanDoneAt: now } : { printingDoneAt: now }),
        },
      });

      // Mirror onto the invoice item lifecycle.
      const itemTo = to === "SCAN_DONE" ? "SCAN_DONE" : "PRINTING_DONE";
      assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, scan.invoiceItem.status, itemTo);
      await tx.invoiceItem.update({ where: { id: scan.invoiceItemId }, data: { status: itemTo } });

      if (to === "PRINTING_DONE") {
        // Case either waits for a report or is complete (spec §14.2).
        const next = scan.invoiceItem.requiresReport ? "AWAITING_REPORT" : "COMPLETED";
        assertTransition("invoiceItem", INVOICE_ITEM_MACHINE, itemTo, next);
        await tx.invoiceItem.update({ where: { id: scan.invoiceItemId }, data: { status: next } });
        await tx.scanOperation.update({ where: { id: scanId }, data: { status: "COMPLETED" } });
        await tx.queueEntry.updateMany({
          where: { invoiceItemId: scan.invoiceItemId, status: "IN_PROGRESS" },
          data: { status: "DONE" },
        });
      }

      await this.audit.log(
        user,
        {
          action: to === "SCAN_DONE" ? "scan.done" : "scan.printing-done",
          module: "scans",
          objectType: "scan_operation",
          objectId: scanId,
          oldValues: { status: scan.status },
          newValues: { status: to },
          ...meta,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Department staff records produced asset counts. Creates usage rows
   * seeded with recipe expectations; deducts department stock.
   */
  async enterAssetUsage(
    scanId: string,
    entries: { inventoryItemId: string; quantity: number }[],
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const scan = await tx.scanOperation.findUnique({
        where: { id: scanId },
        include: { invoiceItem: { include: { test: { include: { assetRecipes: true } } } } },
      });
      if (!scan) throw new NotFoundException("Scan not found");
      assertSameDepartment(user, scan.departmentId);

      const results = [];
      for (const entry of entries) {
        const recipe = scan.invoiceItem.test.assetRecipes.find(
          (r) => r.inventoryItemId === entry.inventoryItemId,
        );
        const existing = await tx.assetUsageRecord.findFirst({
          where: { scanOperationId: scanId, inventoryItemId: entry.inventoryItemId },
        });
        if (existing) {
          throw new BadRequestException("Usage already entered for this item; reception verifies changes");
        }
        const record = await tx.assetUsageRecord.create({
          data: {
            scanOperationId: scanId,
            invoiceItemId: scan.invoiceItemId,
            departmentId: scan.departmentId,
            inventoryItemId: entry.inventoryItemId,
            expectedQuantity: recipe?.expectedQuantity ?? 0,
            departmentEnteredQuantity: entry.quantity,
            enteredById: user.userId,
          },
        });

        // Deduct stock immediately based on the department entry; the
        // reception verification adjusts any difference later.
        if (entry.quantity > 0) {
          const level = await tx.departmentInventory.findUnique({
            where: {
              departmentId_inventoryItemId: {
                departmentId: scan.departmentId,
                inventoryItemId: entry.inventoryItemId,
              },
            },
            include: { item: true },
          });
          if (!level || level.currentQuantity < entry.quantity) {
            throw new BadRequestException(
              `Insufficient department stock for item ${entry.inventoryItemId}`,
            );
          }
          await tx.departmentInventory.update({
            where: { id: level.id },
            data: { currentQuantity: { decrement: entry.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              branchId: level.branchId,
              departmentId: scan.departmentId,
              inventoryItemId: entry.inventoryItemId,
              movementType: "USED_FOR_TEST",
              quantity: entry.quantity,
              unitCost: level.item.costPerUnit,
              totalCost: level.item.costPerUnit * entry.quantity,
              relatedScanOperationId: scanId,
              relatedInvoiceItemId: scan.invoiceItemId,
              createdById: user.userId,
            },
          });
        }
        results.push(record);
      }
      await this.audit.log(
        user,
        {
          action: "inventory.usage.enter",
          module: "inventory",
          objectType: "scan_operation",
          objectId: scanId,
          newValues: { entries },
          ...meta,
        },
        tx,
      );
      return results;
    });
  }

  /**
   * Reception physically inspects outputs and confirms/edits counts
   * (spec §17.3). Differences vs the department entry become extra
   * usage/waste movements and are visible to admin/accounting.
   */
  async verifyAssetUsage(
    scanId: string,
    entries: { inventoryItemId: string; quantity: number }[],
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const records = await tx.assetUsageRecord.findMany({
        where: { scanOperationId: scanId },
        include: { item: true },
      });
      if (!records.length) throw new NotFoundException("No asset usage entered yet");

      const results = [];
      for (const entry of entries) {
        const record = records.find((r) => r.inventoryItemId === entry.inventoryItemId);
        if (!record) throw new BadRequestException(`No department entry for item ${entry.inventoryItemId}`);
        if (record.status !== "DEPARTMENT_ENTERED") {
          throw new BadRequestException("Record already verified");
        }
        const variance = computeUsageVariance(
          record.expectedQuantity,
          record.departmentEnteredQuantity,
          entry.quantity,
        );
        const updated = await tx.assetUsageRecord.update({
          where: { id: record.id },
          data: {
            receptionVerifiedQuantity: entry.quantity,
            finalQuantity: variance.finalQuantity,
            wasteQuantity: variance.extraQuantity,
            verifiedById: user.userId,
            status: "RECEPTION_VERIFIED",
          },
        });

        // Stock adjustment when verified count differs from entered.
        const diff = entry.quantity - record.departmentEnteredQuantity;
        if (diff !== 0) {
          const level = await tx.departmentInventory.findUnique({
            where: {
              departmentId_inventoryItemId: {
                departmentId: record.departmentId,
                inventoryItemId: record.inventoryItemId,
              },
            },
          });
          if (level) {
            if (diff > 0 && level.currentQuantity < diff) {
              throw new BadRequestException("Insufficient stock for verified correction");
            }
            await tx.departmentInventory.update({
              where: { id: level.id },
              data: { currentQuantity: { decrement: diff } },
            });
            await tx.inventoryMovement.create({
              data: {
                branchId: level.branchId,
                departmentId: record.departmentId,
                inventoryItemId: record.inventoryItemId,
                movementType: diff > 0 ? "USED_FOR_TEST" : "RETURN",
                quantity: Math.abs(diff),
                unitCost: record.item.costPerUnit,
                totalCost: record.item.costPerUnit * Math.abs(diff),
                relatedScanOperationId: scanId,
                createdById: user.userId,
                notes: "Reception verification adjustment",
              },
            });
          }
        }
        // Extra usage above the recipe stays on the usage record
        // (wasteQuantity) for admin/accounting variance review; the
        // consumed stock itself is already covered by USED_FOR_TEST
        // movements, so no extra movement row is created here.
        results.push(updated);
      }
      await this.audit.log(
        user,
        {
          action: "inventory.usage.verify",
          module: "inventory",
          objectType: "scan_operation",
          objectId: scanId,
          newValues: { entries },
          ...meta,
        },
        tx,
      );
      return results;
    });
  }
}
