import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { PrismaService } from "../../prisma.service";
import { AuditService } from "../../audit/audit.service";
import { computeUsageVariance } from "../../domain/inventory";

interface Meta {
  ipAddress: string | null;
  deviceInfo: string | null;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listItems() {
    return this.prisma.inventoryItem.findMany({ where: { active: true }, orderBy: { nameEn: "asc" } });
  }

  async createItem(dto: any, user: AuthenticatedUser, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({ data: dto });
      await this.audit.log(
        user,
        { action: "inventory.item.create", module: "inventory", objectType: "inventory_item", objectId: item.id, newValues: dto, ...meta },
        tx,
      );
      return item;
    });
  }

  /** Departments never see each other's stock (spec §17.1). */
  levels(user: AuthenticatedUser, departmentId?: string) {
    let effective: string | undefined = departmentId;
    if (!user.permissions.includes("inventory.read.all")) {
      if (!user.departmentId) throw new ForbiddenException("No department assigned");
      effective = user.departmentId;
    }
    return this.prisma.departmentInventory.findMany({
      where: effective ? { departmentId: effective } : {},
      include: {
        item: true,
        department: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ departmentId: "asc" }],
    });
  }

  async receiveStock(
    dto: { departmentId: string; inventoryItemId: string; quantity: number; unitCost?: number; notes?: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.inventoryItemId } });
      if (!item) throw new NotFoundException("Inventory item not found");
      const unitCost = dto.unitCost ?? item.costPerUnit;
      const level = await tx.departmentInventory.upsert({
        where: {
          departmentId_inventoryItemId: {
            departmentId: dto.departmentId,
            inventoryItemId: dto.inventoryItemId,
          },
        },
        update: { currentQuantity: { increment: dto.quantity } },
        create: {
          branchId: user.branchId,
          departmentId: dto.departmentId,
          inventoryItemId: dto.inventoryItemId,
          currentQuantity: dto.quantity,
        },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          branchId: user.branchId,
          departmentId: dto.departmentId,
          inventoryItemId: dto.inventoryItemId,
          movementType: "RECEIVED",
          quantity: dto.quantity,
          unitCost,
          totalCost: unitCost * dto.quantity,
          createdById: user.userId,
          notes: dto.notes ?? null,
        },
      });
      await this.audit.log(
        user,
        {
          action: "inventory.receive",
          module: "inventory",
          objectType: "inventory_movement",
          objectId: movement.id,
          newValues: dto,
          ...meta,
        },
        tx,
      );
      return { level, movement };
    });
  }

  async recordWaste(
    dto: { departmentId: string; inventoryItemId: string; quantity: number; movementType: "WASTE" | "DAMAGED" | "EXPIRED"; notes: string },
    user: AuthenticatedUser,
    meta: Meta,
  ) {
    // Department-scoped users can only record waste for their own department.
    if (!user.permissions.includes("inventory.receive") && user.departmentId !== dto.departmentId) {
      throw new ForbiddenException("Cannot record waste for another department");
    }
    return this.prisma.$transaction(async (tx) => {
      const level = await tx.departmentInventory.findUnique({
        where: {
          departmentId_inventoryItemId: {
            departmentId: dto.departmentId,
            inventoryItemId: dto.inventoryItemId,
          },
        },
        include: { item: true },
      });
      if (!level) throw new NotFoundException("No stock record for this department/item");
      if (level.currentQuantity < dto.quantity) {
        throw new BadRequestException("Waste exceeds current stock");
      }
      await tx.departmentInventory.update({
        where: { id: level.id },
        data: { currentQuantity: { decrement: dto.quantity } },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          branchId: user.branchId,
          departmentId: dto.departmentId,
          inventoryItemId: dto.inventoryItemId,
          movementType: dto.movementType,
          quantity: dto.quantity,
          unitCost: level.item.costPerUnit,
          totalCost: level.item.costPerUnit * dto.quantity,
          createdById: user.userId,
          notes: dto.notes,
        },
      });
      await this.audit.log(
        user,
        { action: "inventory.waste", module: "inventory", objectType: "inventory_movement", objectId: movement.id, newValues: dto, ...meta },
        tx,
      );
      return movement;
    });
  }

  movements(user: AuthenticatedUser, departmentId: string | undefined, page: number, pageSize: number) {
    let effective: string | undefined = departmentId;
    if (!user.permissions.includes("inventory.read.all")) {
      if (!user.departmentId) throw new ForbiddenException("No department assigned");
      effective = user.departmentId;
    }
    const where = effective ? { departmentId: effective } : {};
    return this.prisma.inventoryMovement.findMany({
      where,
      include: { item: true, department: { select: { name: true, type: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /** Expected vs entered vs verified variance for review (spec §17.4). */
  async varianceReport(from?: string, to?: string) {
    const records = await this.prisma.assetUsageRecord.findMany({
      where: {
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        item: true,
        scanOperation: { select: { departmentId: true, department: { select: { name: true, type: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return records.map((r) => {
      const v = computeUsageVariance(r.expectedQuantity, r.departmentEnteredQuantity, r.receptionVerifiedQuantity);
      return {
        id: r.id,
        department: r.scanOperation.department,
        item: { nameEn: r.item.nameEn, unit: r.item.unit, costPerUnit: r.item.costPerUnit },
        status: r.status,
        ...v,
        extraCost: v.extraQuantity * r.item.costPerUnit,
        createdAt: r.createdAt,
      };
    });
  }

  lowStock() {
    return this.prisma.departmentInventory.findMany({
      where: { currentQuantity: { lte: this.prisma.departmentInventory.fields.lowStockThreshold } },
      include: { item: true, department: { select: { name: true, type: true } } },
    });
  }
}
