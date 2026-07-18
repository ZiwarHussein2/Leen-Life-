import { describe, expect, it } from "vitest";
import {
  computeReferralOutcome,
  discountCodeAmount,
  isReportPriceWithinDeal,
  validateDiscountCode,
} from "../src/domain/discounts";

const baseCode = {
  type: "FIXED" as const,
  value: 5000,
  startDate: new Date("2026-01-01"),
  endDate: new Date("2026-12-31"),
  usageLimit: 10,
  usedCount: 0,
  active: true,
  departmentId: null,
  testId: null,
};
const items = [{ departmentId: "d1", testId: "t1" }];
const mid2026 = new Date("2026-06-15");

describe("discount codes (spec §11)", () => {
  it("accepts a valid code", () => {
    expect(validateDiscountCode(baseCode, mid2026, items)).toEqual({ ok: true });
  });
  it("rejects inactive, not-started, expired, exhausted codes", () => {
    expect(validateDiscountCode({ ...baseCode, active: false }, mid2026, items)).toMatchObject({ reason: "INACTIVE" });
    expect(validateDiscountCode(baseCode, new Date("2025-12-01"), items)).toMatchObject({ reason: "NOT_STARTED" });
    expect(validateDiscountCode(baseCode, new Date("2027-01-01"), items)).toMatchObject({ reason: "EXPIRED" });
    expect(validateDiscountCode({ ...baseCode, usedCount: 10 }, mid2026, items)).toMatchObject({
      reason: "USAGE_LIMIT_REACHED",
    });
  });
  it("rejects codes scoped to another department/test", () => {
    expect(validateDiscountCode({ ...baseCode, departmentId: "other" }, mid2026, items)).toMatchObject({
      reason: "NOT_APPLICABLE",
    });
    expect(validateDiscountCode({ ...baseCode, departmentId: "d1", testId: "t1" }, mid2026, items)).toEqual({ ok: true });
  });
  it("fixed amount is capped at the applicable subtotal", () => {
    expect(discountCodeAmount(baseCode, 3000)).toBe(3000);
    expect(discountCodeAmount(baseCode, 100000)).toBe(5000);
  });
  it("percentage amount floors", () => {
    expect(discountCodeAmount({ ...baseCode, type: "PERCENTAGE", value: 10 }, 15005)).toBe(1500);
  });
  it("zero subtotal yields zero discount", () => {
    expect(discountCodeAmount(baseCode, 0)).toBe(0);
  });
});

describe("referral deals (spec §9)", () => {
  it("fixed per patient pays the partner (Dr. Ziwar case)", () => {
    const o = computeReferralOutcome(
      { dealType: "FIXED_PER_PATIENT", amount: 10000, percentage: null, appliesAsDiscount: false },
      150000,
    );
    expect(o).toEqual({ commission: 10000, appliedAsDiscount: false, payableToPartner: 10000 });
  });
  it("share-as-discount becomes a patient discount, not a payout (Dr. Mohammed case)", () => {
    const o = computeReferralOutcome(
      { dealType: "DISCOUNT_TO_PATIENT", amount: 10000, percentage: null, appliesAsDiscount: true },
      150000,
    );
    expect(o).toEqual({ commission: 10000, appliedAsDiscount: true, payableToPartner: 0 });
  });
  it("no-commission deals pay nothing", () => {
    const o = computeReferralOutcome(
      { dealType: "NO_COMMISSION", amount: null, percentage: null, appliesAsDiscount: false },
      150000,
    );
    expect(o.commission).toBe(0);
    expect(o.payableToPartner).toBe(0);
  });
  it("percentage deals floor and pay the partner", () => {
    const o = computeReferralOutcome(
      { dealType: "PERCENTAGE", amount: null, percentage: 5, appliesAsDiscount: false },
      150000,
    );
    expect(o.commission).toBe(7500);
    expect(o.payableToPartner).toBe(7500);
  });
  it("commission never exceeds the invoice subtotal", () => {
    const o = computeReferralOutcome(
      { dealType: "FIXED_PER_PATIENT", amount: 999999, percentage: null, appliesAsDiscount: false },
      50000,
    );
    expect(o.commission).toBe(50000);
  });
});

describe("report price deal band (spec §14.6)", () => {
  it("within tolerance passes; outside flags", () => {
    expect(isReportPriceWithinDeal(15000, 15000, 5000)).toBe(true);
    expect(isReportPriceWithinDeal(20000, 15000, 5000)).toBe(true);
    expect(isReportPriceWithinDeal(20001, 15000, 5000)).toBe(false);
    expect(isReportPriceWithinDeal(9999, 15000, 5000)).toBe(false);
  });
});
