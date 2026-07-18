/** Discount code and referral deal calculations (spec §9, §11). */

export interface DiscountCodeLike {
  type: "FIXED" | "PERCENTAGE";
  value: number;
  startDate: Date;
  endDate: Date;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  departmentId: string | null;
  testId: string | null;
}

export type DiscountCodeRejection =
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT_REACHED"
  | "NOT_APPLICABLE";

export function validateDiscountCode(
  code: DiscountCodeLike,
  at: Date,
  invoiceItems: { departmentId: string; testId: string }[],
): { ok: true } | { ok: false; reason: DiscountCodeRejection } {
  if (!code.active) return { ok: false, reason: "INACTIVE" };
  if (at < code.startDate) return { ok: false, reason: "NOT_STARTED" };
  if (at > code.endDate) return { ok: false, reason: "EXPIRED" };
  if (code.usageLimit !== null && code.usedCount >= code.usageLimit) {
    return { ok: false, reason: "USAGE_LIMIT_REACHED" };
  }
  if (code.departmentId || code.testId) {
    const applicable = invoiceItems.some(
      (i) =>
        (!code.departmentId || i.departmentId === code.departmentId) &&
        (!code.testId || i.testId === code.testId),
    );
    if (!applicable) return { ok: false, reason: "NOT_APPLICABLE" };
  }
  return { ok: true };
}

/** Amount a discount code takes off the given applicable subtotal. */
export function discountCodeAmount(code: DiscountCodeLike, applicableSubtotal: number): number {
  if (applicableSubtotal <= 0) return 0;
  if (code.type === "FIXED") return Math.min(code.value, applicableSubtotal);
  return Math.floor((applicableSubtotal * code.value) / 100);
}

export interface ReferralDealLike {
  dealType:
    | "FIXED_PER_PATIENT"
    | "PERCENTAGE"
    | "NO_COMMISSION"
    | "DISCOUNT_TO_PATIENT"
    | "CUSTOM";
  amount: number | null;
  percentage: number | null;
  appliesAsDiscount: boolean;
}

export interface ReferralOutcome {
  /** Commission the partner earns (0 when none). */
  commission: number;
  /** True when the commission is applied as a patient discount instead of a payout. */
  appliedAsDiscount: boolean;
  /** Amount payable to the partner (0 when discount-style or no commission). */
  payableToPartner: number;
}

export function computeReferralOutcome(
  deal: ReferralDealLike,
  invoiceSubtotal: number,
): ReferralOutcome {
  let commission = 0;
  switch (deal.dealType) {
    case "FIXED_PER_PATIENT":
    case "CUSTOM":
      commission = deal.amount ?? 0;
      break;
    case "PERCENTAGE":
      commission = Math.floor((invoiceSubtotal * (deal.percentage ?? 0)) / 100);
      break;
    case "DISCOUNT_TO_PATIENT":
      commission = deal.amount ?? Math.floor((invoiceSubtotal * (deal.percentage ?? 0)) / 100);
      break;
    case "NO_COMMISSION":
      commission = 0;
      break;
  }
  commission = Math.max(0, Math.min(commission, invoiceSubtotal));
  const appliedAsDiscount = deal.dealType === "DISCOUNT_TO_PATIENT" || deal.appliesAsDiscount;
  return {
    commission,
    appliedAsDiscount,
    payableToPartner: appliedAsDiscount || deal.dealType === "NO_COMMISSION" ? 0 : commission,
  };
}

/**
 * Report-doctor price review (spec §14.6): a price outside the agreed
 * band must be flagged for accounting/admin review.
 */
export function isReportPriceWithinDeal(
  entered: number,
  agreedPrice: number,
  tolerance: number,
): boolean {
  return Math.abs(entered - agreedPrice) <= tolerance;
}
