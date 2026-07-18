import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, effectivePrice, minutesOfDay, resolveTimePrice } from "../src/domain/pricing";

const rules = [
  { id: "morning", startTime: "08:00", endTime: "14:00", price: 140000 },
  { id: "evening", startTime: "14:00", endTime: "21:30", price: 160000 },
];

function at(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2026, 6, 18);
  d.setHours(h, m, 0, 0);
  return d;
}

describe("time-based pricing (spec §10.1)", () => {
  it("selects the morning price inside 08:00-14:00", () => {
    expect(resolveTimePrice(rules, at("09:30"))?.id).toBe("morning");
  });
  it("start time is inclusive", () => {
    expect(resolveTimePrice(rules, at("08:00"))?.id).toBe("morning");
  });
  it("end time is exclusive — 14:00 belongs to the evening rule", () => {
    expect(resolveTimePrice(rules, at("14:00"))?.id).toBe("evening");
  });
  it("falls back to base price outside all windows", () => {
    expect(resolveTimePrice(rules, at("23:00"))).toBeNull();
    expect(effectivePrice(150000, rules, at("23:00"))).toEqual({ price: 150000, ruleId: null });
  });
  it("handles windows crossing midnight", () => {
    const night = [{ id: "night", startTime: "22:00", endTime: "06:00", price: 99000 }];
    expect(resolveTimePrice(night, at("23:30"))?.id).toBe("night");
    expect(resolveTimePrice(night, at("05:00"))?.id).toBe("night");
    expect(resolveTimePrice(night, at("12:00"))).toBeNull();
  });
  it("respects activeFrom/activeTo bounds", () => {
    const dated = [{ ...rules[0], activeFrom: new Date("2030-01-01") }];
    expect(resolveTimePrice(dated, at("09:00"))).toBeNull();
  });
  it("rejects invalid time strings", () => {
    expect(() => minutesOfDay("25:00")).toThrow();
    expect(() => minutesOfDay("aa:bb")).toThrow();
  });
});

describe("invoice totals", () => {
  it("sums items and applies discounts", () => {
    const totals = computeInvoiceTotals(
      [
        { finalPrice: 100000, quantity: 1, discountAmount: 0 },
        { finalPrice: 25000, quantity: 2, discountAmount: 5000 },
      ],
      10000,
    );
    expect(totals).toEqual({ subtotal: 150000, discountTotal: 15000, netTotal: 135000 });
  });
  it("never produces a negative net total", () => {
    const totals = computeInvoiceTotals([{ finalPrice: 10000, quantity: 1, discountAmount: 0 }], 50000);
    expect(totals.netTotal).toBe(0);
  });
  it("rejects negative invoice-level discounts", () => {
    expect(() => computeInvoiceTotals([{ finalPrice: 1, quantity: 1, discountAmount: 0 }], -5)).toThrow();
  });
});
