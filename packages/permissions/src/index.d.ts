/**
 * RBAC definitions for the Leen Life Operations Platform.
 *
 * This is the single source of truth for permission keys, role keys, and
 * the role → permission matrix. The database is seeded from these values
 * and the API enforces them on every request (backend authorization —
 * hiding UI is never security).
 */
export declare const PERMISSIONS: {
    readonly "patients.read": "View patient records";
    readonly "patients.create": "Register new patients";
    readonly "patients.update": "Update patient records";
    readonly "invoices.read": "View invoices";
    readonly "invoices.create": "Create invoices";
    readonly "invoices.finalize": "Finalize invoices";
    readonly "invoices.cancel": "Cancel invoices";
    readonly "payments.create": "Record payments";
    readonly "payments.read": "View payments";
    readonly "pricing.read": "View test prices";
    readonly "pricing.manage": "Create/update tests, base prices, time-based prices";
    readonly "discounts.request": "Create discount requests";
    readonly "discounts.approve": "Approve or reject discount requests";
    readonly "discounts.codes.manage": "Create and manage discount codes";
    readonly "discounts.codes.apply": "Apply a discount code to an invoice";
    readonly "referrals.read": "View referral partners and balances";
    readonly "referrals.manage": "Manage referral partners and deals";
    readonly "referrals.settle": "Process referral cashouts";
    readonly "queues.read.own-department": "View own department queue";
    readonly "queues.read.all": "View all department queues";
    readonly "queues.reorder": "Reorder queue with reason";
    readonly "scans.operate.own-department": "Start/complete scans in own department";
    readonly "scans.read.all": "View scan operations across departments";
    readonly "files.upload.own-department": "Upload scan files for own department cases";
    readonly "files.download.assigned": "Download files for assigned cases";
    readonly "files.download.all": "Download any file in branch";
    readonly "files.keep-flag": "Set/unset the Keep flag on files";
    readonly "reports.assign": "Assign report doctors";
    readonly "reports.write.assigned": "Write reports for assigned cases";
    readonly "reports.write.sonar": "Write sonar reports directly";
    readonly "reports.read.all": "View all reports";
    readonly "reports.print": "Print final reports";
    readonly "reports.price.review": "Review/adjust report prices";
    readonly "inventory.read.own-department": "View own department inventory";
    readonly "inventory.read.all": "View all inventory";
    readonly "inventory.receive": "Receive stock";
    readonly "inventory.usage.enter": "Enter asset usage for own department";
    readonly "inventory.usage.verify": "Verify physical asset outputs (reception)";
    readonly "inventory.usage.review": "Review/adjust verified usage (admin/accounting)";
    readonly "inventory.manage": "Manage inventory items and recipes";
    readonly "accounting.reports.read": "View financial reports";
    readonly "accounting.cashouts.manage": "Create/approve cashout batches";
    readonly "accounting.salaries.manage": "Process salaries and payroll";
    readonly "employees.applications.review": "Review employee applications";
    readonly "employees.positions.assign": "Assign jobs/positions";
    readonly "employees.policies.manage": "Write/update work policies";
    readonly "employees.contracts.read": "Download employee contract PDFs";
    readonly "attendance.self": "Check in/out own attendance";
    readonly "attendance.read.all": "View all attendance records";
    readonly "attendance.adjust": "Manually correct attendance (with reason)";
    readonly "users.read": "View users";
    readonly "users.manage": "Create/update users and roles";
    readonly "departments.manage": "Manage departments";
    readonly "audit.read": "View audit logs";
    readonly "security.alerts.read": "View security alerts";
    readonly "security.alerts.manage": "Resolve security alerts";
    readonly "settings.manage": "Manage system settings";
    readonly "soft-delete.restore": "Restore soft-deleted records";
    readonly "report-doctor.earnings.read.own": "View own report earnings and cashouts";
    readonly "merna.summaries.read": "Read aggregated branch summaries (privacy-filtered)";
};
export type PermissionKey = keyof typeof PERMISSIONS;
export declare const ROLES: {
    readonly PLATFORM_ADMIN: "GashtySoft Platform Owner / Security Administrator";
    readonly BRANCH_ADMIN: "Leen Life Admin";
    readonly ACCOUNTING: "Accounting User";
    readonly RECEPTION: "Reception User";
    readonly DEPARTMENT_OPERATOR: "Department Operator";
    readonly SONAR_DOCTOR: "Sonar Doctor";
    readonly REPORT_DOCTOR: "Report Doctor / Report Writer";
    readonly EMPLOYEE: "Employee Portal User";
    readonly MERNA_GOVERNANCE: "Merna Super Admin / Parent-Company Governance User";
};
export type RoleKey = keyof typeof ROLES;
/**
 * Role → permission matrix. Deny by default: anything not listed is
 * forbidden. Department-scoped permissions (".own-department",
 * ".assigned") are additionally constrained by object-level checks in
 * the API layer (department match / case assignment).
 */
export declare const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]>;
/** Roles that must always have MFA enabled (spec §22.2). */
export declare const MFA_REQUIRED_ROLES: RoleKey[];
export declare function roleHasPermission(role: RoleKey, permission: PermissionKey): boolean;
/**
 * Department-scoped roles: users in these roles must have a departmentId
 * and may only operate on objects belonging to that department.
 */
export declare const DEPARTMENT_SCOPED_ROLES: RoleKey[];
export declare function isDepartmentScoped(role: RoleKey): boolean;
