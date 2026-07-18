import { describe, expect, it } from "vitest";
import {
  ALL_MACHINES,
  assertTransition,
  canTransition,
  INVOICE_ITEM_MACHINE,
  INVOICE_MACHINE,
  InvalidTransitionError,
  REPORT_MACHINE,
  SCAN_MACHINE,
} from "../src/state-machines";

describe("state machine engine", () => {
  it("allows listed transitions and rejects everything else", () => {
    expect(canTransition(INVOICE_MACHINE, "DRAFT", "FINALIZED")).toBe(true);
    expect(canTransition(INVOICE_MACHINE, "FINALIZED", "DRAFT")).toBe(false);
    expect(() => assertTransition("invoice", INVOICE_MACHINE, "CANCELLED", "FINALIZED")).toThrow(
      InvalidTransitionError,
    );
  });

  it("every machine's target states exist as source states (no dead ends)", () => {
    for (const [name, machine] of Object.entries(ALL_MACHINES)) {
      const states = Object.keys(machine);
      for (const [from, targets] of Object.entries(machine)) {
        for (const to of targets as string[]) {
          expect(states, `${name}: ${from} -> ${to} target must be a declared state`).toContain(to);
        }
      }
    }
  });

  it("terminal states have no outgoing transitions where required", () => {
    expect(INVOICE_MACHINE.CANCELLED).toHaveLength(0);
    expect(SCAN_MACHINE.COMPLETED).toHaveLength(0);
    expect(INVOICE_ITEM_MACHINE.COMPLETED).toHaveLength(0);
  });

  it("case lifecycle: happy path is fully traversable", () => {
    const path = ["PENDING", "IN_QUEUE", "IN_PROGRESS", "SCAN_DONE", "PRINTING_DONE", "AWAITING_REPORT", "REPORT_IN_PROGRESS", "COMPLETED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(INVOICE_ITEM_MACHINE, path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("reports: submitted can be amended but not silently re-drafted", () => {
    expect(canTransition(REPORT_MACHINE, "SUBMITTED", "AMENDED")).toBe(true);
    expect(canTransition(REPORT_MACHINE, "SUBMITTED", "DRAFT")).toBe(false);
    expect(canTransition(REPORT_MACHINE, "PRINTED", "AMENDED")).toBe(true);
  });
});
