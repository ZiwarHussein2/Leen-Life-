/** Inventory variance and waste analysis (spec §17). */

export interface UsageVariance {
  expected: number;
  departmentEntered: number;
  receptionVerified: number | null;
  /** Final official usage (verified count unless later adjusted). */
  finalQuantity: number;
  /** Usage above the recipe expectation. */
  extraQuantity: number;
  /** Mismatch between department entry and reception verification. */
  entryMismatch: number;
}

export function computeUsageVariance(
  expected: number,
  departmentEntered: number,
  receptionVerified: number | null,
): UsageVariance {
  const finalQuantity = receptionVerified ?? departmentEntered;
  return {
    expected,
    departmentEntered,
    receptionVerified,
    finalQuantity,
    extraQuantity: Math.max(0, finalQuantity - expected),
    entryMismatch: receptionVerified === null ? 0 : Math.abs(departmentEntered - receptionVerified),
  };
}

export function wasteCost(wasteQuantity: number, unitCost: number): number {
  if (wasteQuantity < 0 || unitCost < 0) throw new Error("Negative waste input");
  return wasteQuantity * unitCost;
}

/** Stock after applying a movement; rejects impossible withdrawals. */
export function applyMovement(
  currentQuantity: number,
  movementType:
    | "RECEIVED"
    | "TRANSFERRED"
    | "USED_FOR_TEST"
    | "WASTE"
    | "CORRECTION"
    | "RETURN"
    | "DAMAGED"
    | "EXPIRED",
  quantity: number,
): number {
  if (quantity < 0) throw new Error("Movement quantity must be positive");
  switch (movementType) {
    case "RECEIVED":
    case "RETURN":
      return currentQuantity + quantity;
    case "CORRECTION":
      // Correction sets absolute stock; caller passes the new value.
      return quantity;
    default: {
      const next = currentQuantity - quantity;
      if (next < 0) {
        throw new Error(
          `Insufficient stock: have ${currentQuantity}, tried to remove ${quantity}`,
        );
      }
      return next;
    }
  }
}
