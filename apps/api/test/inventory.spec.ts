import { describe, expect, it } from "vitest";
import { applyMovement, computeUsageVariance, wasteCost } from "../src/domain/inventory";

describe("usage variance (spec §17.4)", () => {
  it("the spec example: expected 2, entered 3, verified 3 → extra 1", () => {
    const v = computeUsageVariance(2, 3, 3);
    expect(v.finalQuantity).toBe(3);
    expect(v.extraQuantity).toBe(1);
    expect(v.entryMismatch).toBe(0);
  });
  it("reception correction creates an entry mismatch signal", () => {
    const v = computeUsageVariance(2, 4, 2);
    expect(v.finalQuantity).toBe(2);
    expect(v.extraQuantity).toBe(0);
    expect(v.entryMismatch).toBe(2);
  });
  it("unverified usage falls back to the department entry", () => {
    const v = computeUsageVariance(2, 3, null);
    expect(v.finalQuantity).toBe(3);
    expect(v.entryMismatch).toBe(0);
  });
});

describe("stock movements", () => {
  it("received/return add, usage/waste subtract", () => {
    expect(applyMovement(10, "RECEIVED", 5)).toBe(15);
    expect(applyMovement(10, "RETURN", 2)).toBe(12);
    expect(applyMovement(10, "USED_FOR_TEST", 3)).toBe(7);
    expect(applyMovement(10, "WASTE", 1)).toBe(9);
  });
  it("correction sets absolute stock", () => {
    expect(applyMovement(10, "CORRECTION", 42)).toBe(42);
  });
  it("rejects withdrawals below zero and negative quantities", () => {
    expect(() => applyMovement(2, "USED_FOR_TEST", 3)).toThrow();
    expect(() => applyMovement(2, "RECEIVED", -1)).toThrow();
  });
  it("waste cost multiplies and rejects negatives", () => {
    expect(wasteCost(3, 3000)).toBe(9000);
    expect(() => wasteCost(-1, 3000)).toThrow();
  });
});
