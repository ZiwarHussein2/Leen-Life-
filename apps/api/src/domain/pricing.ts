/**
 * Time-based pricing (spec §10.1): MRI and CT prices differ by time of
 * day. The system automatically selects the correct price from the
 * booking/test time; the chosen rule is snapshotted on the invoice item.
 */

export interface TimePriceRuleLike {
  id: string;
  startTime: string; // "HH:MM" inclusive
  endTime: string; // "HH:MM" exclusive
  price: number;
  activeFrom?: Date | null;
  activeTo?: Date | null;
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time-of-day: ${hhmm}`);
  }
  return h * 60 + m;
}

/**
 * Resolve the applicable price for a test at a given moment.
 * Returns the matching rule (first match wins on overlap, which admin
 * tooling should prevent) or null when the base price applies.
 */
export function resolveTimePrice(
  rules: TimePriceRuleLike[],
  at: Date,
): TimePriceRuleLike | null {
  const minutes = at.getHours() * 60 + at.getMinutes();
  for (const rule of rules) {
    if (rule.activeFrom && at < rule.activeFrom) continue;
    if (rule.activeTo && at > rule.activeTo) continue;
    const start = minutesOfDay(rule.startTime);
    const end = minutesOfDay(rule.endTime);
    const inWindow =
      start <= end
        ? minutes >= start && minutes < end
        : minutes >= start || minutes < end; // window crossing midnight
    if (inWindow) return rule;
  }
  return null;
}

export function effectivePrice(basePrice: number, rules: TimePriceRuleLike[], at: Date): {
  price: number;
  ruleId: string | null;
} {
  const rule = resolveTimePrice(rules, at);
  return { price: rule?.price ?? basePrice, ruleId: rule?.id ?? null };
}

/** Recompute invoice totals from item prices and discounts. */
export function computeInvoiceTotals(
  items: { finalPrice: number; quantity: number; discountAmount: number }[],
  invoiceLevelDiscount = 0,
): { subtotal: number; discountTotal: number; netTotal: number } {
  const subtotal = items.reduce((sum, i) => sum + i.finalPrice * i.quantity, 0);
  const itemDiscounts = items.reduce((sum, i) => sum + i.discountAmount, 0);
  const discountTotal = itemDiscounts + invoiceLevelDiscount;
  if (invoiceLevelDiscount < 0) throw new Error("Discount cannot be negative");
  const netTotal = Math.max(0, subtotal - discountTotal);
  return { subtotal, discountTotal, netTotal };
}
