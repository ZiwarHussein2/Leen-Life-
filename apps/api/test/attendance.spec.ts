import { describe, expect, it } from "vitest";
import {
  computeAttendance,
  computePayroll,
  distanceMeters,
  isInsideGeofence,
} from "../src/domain/attendance";

const leenLife = { lat: 36.1901, lng: 44.0091 };

describe("geofence (spec §19.4)", () => {
  it("accepts a point at the centre and inside the radius", () => {
    expect(isInsideGeofence(leenLife, leenLife, 150)).toBe(true);
    expect(isInsideGeofence({ lat: 36.1905, lng: 44.0095 }, leenLife, 150)).toBe(true);
  });
  it("rejects a point far away (e.g. home check-in)", () => {
    expect(isInsideGeofence({ lat: 36.2101, lng: 44.0091 }, leenLife, 150)).toBe(false);
  });
  it("distance is symmetric and roughly correct", () => {
    const a = { lat: 36.19, lng: 44.0 };
    const b = { lat: 36.19, lng: 44.01 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(1000);
    expect(Math.abs(d - distanceMeters(b, a))).toBeLessThan(0.001);
  });
});

function dateAt(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2026, 6, 18);
  d.setHours(h, m, 0, 0);
  return d;
}
const window = { startTime: "08:00", endTime: "16:00" };

describe("attendance calculation", () => {
  it("on-time within grace is not late", () => {
    expect(computeAttendance(dateAt("08:10"), dateAt("16:00"), window).lateMinutes).toBe(0);
  });
  it("beyond grace counts full lateness", () => {
    expect(computeAttendance(dateAt("08:30"), dateAt("16:00"), window).lateMinutes).toBe(30);
  });
  it("early leave and overtime computed from checkout", () => {
    expect(computeAttendance(dateAt("08:00"), dateAt("15:00"), window).earlyLeaveMinutes).toBe(60);
    expect(computeAttendance(dateAt("08:00"), dateAt("17:30"), window).overtimeMinutes).toBe(90);
  });
  it("no checkout yields zero leave/overtime", () => {
    const calc = computeAttendance(dateAt("08:00"), null, window);
    expect(calc.earlyLeaveMinutes).toBe(0);
    expect(calc.overtimeMinutes).toBe(0);
  });
});

describe("payroll (spec §18.4)", () => {
  const rules = { latePerMinute: 100, earlyLeavePerMinute: 100, overtimePerMinute: 150, absentDayDeduction: 25000 };
  it("computes deduction and overtime", () => {
    const result = computePayroll(
      1000000,
      [
        { lateMinutes: 30, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
        { lateMinutes: 0, earlyLeaveMinutes: 60, overtimeMinutes: 0 },
        { lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 120 },
        { lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, absent: true },
      ],
      rules,
    );
    expect(result.deductionAmount).toBe(30 * 100 + 60 * 100 + 25000);
    expect(result.overtimeAmount).toBe(120 * 150);
    expect(result.netSalary).toBe(1000000 - 34000 + 18000);
  });
  it("deduction never exceeds base salary", () => {
    const result = computePayroll(10000, [{ lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, absent: true }], rules);
    expect(result.deductionAmount).toBe(10000);
    expect(result.netSalary).toBe(0);
  });
});
