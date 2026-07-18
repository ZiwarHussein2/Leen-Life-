/**
 * RBAC definitions for the Leen Life Operations Platform.
 *
 * This is the single source of truth for permission keys, role keys, and
 * the role → permission matrix. The database is seeded from these values
 * and the API enforces them on every request (backend authorization —
 * hiding UI is never security).
 */

export const PERMISSIONS = {
  // Patients
  "patients.read": "View patient records",
  "patients.create": "Register new patients",
  "patients.update": "Update patient records",

  // Invoices / payments
  "invoices.read": "View invoices",
  "invoices.create": "Create invoices",
  "invoices.finalize": "Finalize invoices",
  "invoices.cancel": "Cancel invoices",
  "payments.create": "Record payments",
  "payments.read": "View payments",

  // Pricing
  "pricing.read": "View test prices",
  "pricing.manage": "Create/update tests, base prices, time-based prices",

  // Discounts
  "discounts.request": "Create discount requests",
  "discounts.approve": "Approve or reject discount requests",
  "discounts.codes.manage": "Create and manage discount codes",
  "discounts.codes.apply": "Apply a discount code to an invoice",

  // Referrals
  "referrals.read": "View referral partners and balances",
  "referrals.manage": "Manage referral partners and deals",
  "referrals.settle": "Process referral cashouts",

  // Queues
  "queues.read.own-department": "View own department queue",
  "queues.read.all": "View all department queues",
  "queues.reorder": "Reorder queue with reason",

  // Scan operations
  "scans.operate.own-department": "Start/complete scans in own department",
  "scans.read.all": "View scan operations across departments",

  // Files
  "files.upload.own-department": "Upload scan files for own department cases",
  "files.download.assigned": "Download files for assigned cases",
  "files.download.all": "Download any file in branch",
  "files.keep-flag": "Set/unset the Keep flag on files",

  // Reports
  "reports.assign": "Assign report doctors",
  "reports.write.assigned": "Write reports for assigned cases",
  "reports.write.sonar": "Write sonar reports directly",
  "reports.read.all": "View all reports",
  "reports.print": "Print final reports",
  "reports.price.review": "Review/adjust report prices",

  // Inventory
  "inventory.read.own-department": "View own department inventory",
  "inventory.read.all": "View all inventory",
  "inventory.receive": "Receive stock",
  "inventory.usage.enter": "Enter asset usage for own department",
  "inventory.usage.verify": "Verify physical asset outputs (reception)",
  "inventory.usage.review": "Review/adjust verified usage (admin/accounting)",
  "inventory.manage": "Manage inventory items and recipes",

  // Accounting
  "accounting.reports.read": "View financial reports",
  "accounting.cashouts.manage": "Create/approve cashout batches",
  "accounting.salaries.manage": "Process salaries and payroll",

  // Employees / HR
  "employees.applications.review": "Review employee applications",
  "employees.positions.assign": "Assign jobs/positions",
  "employees.policies.manage": "Write/update work policies",
  "employees.contracts.read": "Download employee contract PDFs",
  "attendance.self": "Check in/out own attendance",
  "attendance.read.all": "View all attendance records",
  "attendance.adjust": "Manually correct attendance (with reason)",

  // Administration
  "users.read": "View users",
  "users.manage": "Create/update users and roles",
  "departments.manage": "Manage departments",
  "audit.read": "View audit logs",
  "security.alerts.read": "View security alerts",
  "security.alerts.manage": "Resolve security alerts",
  "settings.manage": "Manage system settings",
  "soft-delete.restore": "Restore soft-deleted records",

  // Report doctor self-service
  "report-doctor.earnings.read.own": "View own report earnings and cashouts",

  // Merna connector (service-to-service; never granted to human staff roles)
  "merna.summaries.read": "Read aggregated branch summaries (privacy-filtered)",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ROLES = {
  PLATFORM_ADMIN: "GashtySoft Platform Owner / Security Administrator",
  BRANCH_ADMIN: "Leen Life Admin",
  ACCOUNTING: "Accounting User",
  RECEPTION: "Reception User",
  DEPARTMENT_OPERATOR: "Department Operator",
  SONAR_DOCTOR: "Sonar Doctor",
  REPORT_DOCTOR: "Report Doctor / Report Writer",
  EMPLOYEE: "Employee Portal User",
  MERNA_GOVERNANCE: "Merna Super Admin / Parent-Company Governance User",
} as const;

export type RoleKey = keyof typeof ROLES;

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * Role → permission matrix. Deny by default: anything not listed is
 * forbidden. Department-scoped permissions (".own-department",
 * ".assigned") are additionally constrained by object-level checks in
 * the API layer (department match / case assignment).
 */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  // Technical platform role: full access, but never hidden — always
  // MFA-protected and fully audited.
  PLATFORM_ADMIN: ALL_PERMISSIONS,

  BRANCH_ADMIN: [
    "patients.read",
    "patients.create",
    "patients.update",
    "invoices.read",
    "invoices.create",
    "invoices.finalize",
    "invoices.cancel",
    "payments.read",
    "payments.create",
    "pricing.read",
    "pricing.manage",
    "discounts.request",
    "discounts.approve",
    "discounts.codes.manage",
    "discounts.codes.apply",
    "referrals.read",
    "referrals.manage",
    "referrals.settle",
    "queues.read.all",
    "queues.reorder",
    "scans.read.all",
    "files.download.all",
    "files.keep-flag",
    "reports.assign",
    "reports.read.all",
    "reports.print",
    "reports.price.review",
    "inventory.read.all",
    "inventory.receive",
    "inventory.usage.review",
    "inventory.manage",
    "accounting.reports.read",
    "accounting.cashouts.manage",
    "accounting.salaries.manage",
    "employees.applications.review",
    "employees.positions.assign",
    "employees.policies.manage",
    "employees.contracts.read",
    "attendance.self",
    "attendance.read.all",
    "attendance.adjust",
    "users.read",
    "users.manage",
    "departments.manage",
    "audit.read",
    "security.alerts.read",
    "security.alerts.manage",
    "settings.manage",
    "soft-delete.restore",
  ],

  ACCOUNTING: [
    "patients.read",
    "invoices.read",
    "payments.read",
    "payments.create",
    "pricing.read",
    "discounts.approve",
    "discounts.codes.manage",
    "referrals.read",
    "referrals.manage",
    "referrals.settle",
    "reports.read.all",
    "reports.price.review",
    "inventory.read.all",
    "inventory.usage.review",
    "accounting.reports.read",
    "accounting.cashouts.manage",
    "accounting.salaries.manage",
    "attendance.self",
    "attendance.read.all",
    "audit.read",
  ],

  RECEPTION: [
    "patients.read",
    "patients.create",
    "patients.update",
    "invoices.read",
    "invoices.create",
    "invoices.finalize",
    "payments.create",
    "payments.read",
    "pricing.read",
    "discounts.request",
    "discounts.codes.apply",
    "referrals.read",
    "queues.read.all",
    "scans.read.all",
    "reports.assign",
    "reports.print",
    "inventory.usage.verify",
    "attendance.self",
  ],

  DEPARTMENT_OPERATOR: [
    "queues.read.own-department",
    "scans.operate.own-department",
    "files.upload.own-department",
    "inventory.read.own-department",
    "inventory.usage.enter",
    "attendance.self",
  ],

  SONAR_DOCTOR: [
    "queues.read.own-department",
    "scans.operate.own-department",
    "reports.write.sonar",
    "reports.print",
    "inventory.read.own-department",
    "inventory.usage.enter",
    "attendance.self",
  ],

  REPORT_DOCTOR: [
    "reports.write.assigned",
    "files.download.assigned",
    "report-doctor.earnings.read.own",
  ],

  EMPLOYEE: ["attendance.self"],

  // Aggregate/governance access only. No patient-level, employee-ID,
  // raw-location, or medical-report permissions. Enforced again at the
  // API layer with data masking.
  MERNA_GOVERNANCE: ["merna.summaries.read", "accounting.reports.read"],
};

/** Roles that must always have MFA enabled (spec §22.2). */
export const MFA_REQUIRED_ROLES: RoleKey[] = [
  "PLATFORM_ADMIN",
  "BRANCH_ADMIN",
  "ACCOUNTING",
  "REPORT_DOCTOR",
];

export function roleHasPermission(role: RoleKey, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Department-scoped roles: users in these roles must have a departmentId
 * and may only operate on objects belonging to that department.
 */
export const DEPARTMENT_SCOPED_ROLES: RoleKey[] = ["DEPARTMENT_OPERATOR", "SONAR_DOCTOR"];

export function isDepartmentScoped(role: RoleKey): boolean {
  return DEPARTMENT_SCOPED_ROLES.includes(role);
}
