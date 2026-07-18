/**
 * Explicit state machines for workflow entities (spec §33.1).
 * The API rejects any transition not listed here; unit tests cover
 * every machine.
 */

export type TransitionMap<S extends string> = Record<S, readonly S[]>;

export function canTransition<S extends string>(
  machine: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return (machine[from] ?? []).includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition<S extends string>(
  entity: string,
  machine: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(machine, from, to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}

// ── Employee application ──
export const EMPLOYEE_APPLICATION_MACHINE = {
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["UNDER_REVIEW"], // allow re-review after appeal
} as const satisfies TransitionMap<string>;

// ── Employee position (offer → acceptance) ──
export const EMPLOYEE_POSITION_MACHINE = {
  OFFERED: ["ACCEPTED", "DECLINED"],
  ACCEPTED: ["ACTIVE"],
  DECLINED: [],
  ACTIVE: ["ENDED"],
  ENDED: [],
} as const satisfies TransitionMap<string>;

// ── Invoice ──
export const INVOICE_MACHINE = {
  DRAFT: ["PENDING_DISCOUNT", "FINALIZED", "CANCELLED"],
  PENDING_DISCOUNT: ["DRAFT", "FINALIZED", "CANCELLED"],
  FINALIZED: ["CANCELLED"],
  CANCELLED: [],
} as const satisfies TransitionMap<string>;

// ── Payment status (derived, but transitions still validated) ──
export const PAYMENT_STATUS_MACHINE = {
  UNPAID: ["PARTIAL", "PAID"],
  PARTIAL: ["PAID", "REFUNDED"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
} as const satisfies TransitionMap<string>;

// ── Discount request ──
export const DISCOUNT_REQUEST_MACHINE = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
} as const satisfies TransitionMap<string>;

// ── Queue entry ──
export const QUEUE_MACHINE = {
  WAITING: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
  NO_SHOW: ["WAITING"], // patient may return the same day
} as const satisfies TransitionMap<string>;

// ── Scan operation ──
export const SCAN_MACHINE = {
  STARTED: ["SCAN_DONE", "CANCELLED"],
  SCAN_DONE: ["PRINTING_DONE", "CANCELLED"],
  PRINTING_DONE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies TransitionMap<string>;

// ── Invoice item (case lifecycle) ──
export const INVOICE_ITEM_MACHINE = {
  PENDING: ["IN_QUEUE", "CANCELLED"],
  IN_QUEUE: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SCAN_DONE", "CANCELLED"],
  SCAN_DONE: ["PRINTING_DONE", "CANCELLED"],
  PRINTING_DONE: ["AWAITING_REPORT", "COMPLETED"],
  AWAITING_REPORT: ["REPORT_IN_PROGRESS", "COMPLETED"],
  REPORT_IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies TransitionMap<string>;

// ── Uploaded file scan/quarantine ──
export const FILE_SCAN_MACHINE = {
  PENDING: ["CLEAN", "QUARANTINED", "REJECTED"],
  CLEAN: [],
  QUARANTINED: ["CLEAN", "REJECTED"],
  REJECTED: [],
} as const satisfies TransitionMap<string>;

// ── Report assignment ──
export const REPORT_ASSIGNMENT_MACHINE = {
  ASSIGNED: ["ACCEPTED", "IN_PROGRESS", "CANCELLED", "REASSIGNED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED", "REASSIGNED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED", "REASSIGNED"],
  COMPLETED: [],
  CANCELLED: [],
  REASSIGNED: [],
} as const satisfies TransitionMap<string>;

// ── Medical report ──
export const REPORT_MACHINE = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["PRINTED", "AMENDED"],
  PRINTED: ["AMENDED"],
  AMENDED: ["SUBMITTED"],
} as const satisfies TransitionMap<string>;

// ── Asset usage verification ──
export const ASSET_USAGE_MACHINE = {
  DEPARTMENT_ENTERED: ["RECEPTION_VERIFIED"],
  RECEPTION_VERIFIED: ["ADMIN_REVIEWED", "ADJUSTED"],
  ADMIN_REVIEWED: ["ADJUSTED"],
  ADJUSTED: [],
} as const satisfies TransitionMap<string>;

// ── Cashout batch ──
export const CASHOUT_MACHINE = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
} as const satisfies TransitionMap<string>;

// ── Salary record ──
export const SALARY_MACHINE = {
  DRAFT: ["APPROVED"],
  APPROVED: ["PAID"],
  PAID: [],
} as const satisfies TransitionMap<string>;

// ── Security alert / incident ──
export const SECURITY_ALERT_MACHINE = {
  OPEN: ["INVESTIGATING", "RESOLVED", "DISMISSED"],
  INVESTIGATING: ["RESOLVED", "DISMISSED"],
  RESOLVED: [],
  DISMISSED: [],
} as const satisfies TransitionMap<string>;

export const ALL_MACHINES = {
  employeeApplication: EMPLOYEE_APPLICATION_MACHINE,
  employeePosition: EMPLOYEE_POSITION_MACHINE,
  invoice: INVOICE_MACHINE,
  paymentStatus: PAYMENT_STATUS_MACHINE,
  discountRequest: DISCOUNT_REQUEST_MACHINE,
  queue: QUEUE_MACHINE,
  scan: SCAN_MACHINE,
  invoiceItem: INVOICE_ITEM_MACHINE,
  fileScan: FILE_SCAN_MACHINE,
  reportAssignment: REPORT_ASSIGNMENT_MACHINE,
  report: REPORT_MACHINE,
  assetUsage: ASSET_USAGE_MACHINE,
  cashout: CASHOUT_MACHINE,
  salary: SALARY_MACHINE,
  securityAlert: SECURITY_ALERT_MACHINE,
} as const;
