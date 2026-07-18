# Authorization model

Deny by default. Three layers on every request:

1. **Authentication** (`JwtAuthGuard`): verifies the JWT (Supabase secret, or dev secret when `AUTH_DEV_MODE=true`), loads the user + role + permissions from the database, rejects inactive accounts, and enforces MFA (`aal2` claim) for MFA-required roles.
2. **Permission guard** (`@RequirePermissions(...)`): route-level check against the role→permission matrix in `packages/permissions`. Multiple keys mean "any of".
3. **Object-level checks** (services): department match (`assertSameDepartment`), case assignment (report doctors), ownership (own earnings/agreements), branch match. This is the BOLA defense — IDs from the URL are never trusted.

## Roles

| Role | Scope highlights |
|---|---|
| PLATFORM_ADMIN | Everything; MFA required; fully audited — never hidden |
| BRANCH_ADMIN | All Leen Life data; approvals; user/HR management |
| ACCOUNTING | Financial data, price reviews, cashouts, payroll; no user admin |
| RECEPTION | Patients, invoices, payments, queue overview, report assignment/printing, asset verification. **Cannot** apply discounts or change prices |
| DEPARTMENT_OPERATOR | Own department queue/scans/uploads/inventory only |
| SONAR_DOCTOR | Sonar queue + direct report writing |
| REPORT_DOCTOR | Assigned cases only; signed downloads; own earnings; MFA required |
| EMPLOYEE | Own attendance/application/agreements only |
| MERNA_GOVERNANCE | Aggregated summaries only; no person-level data |

The full matrix lives in `packages/permissions/src/index.ts` (seeded into `roles`/`permissions`/`role_permissions`).

## Spec §28 checklist → enforcement point

- Reception cannot discount/change prices → no `discounts.approve`/`pricing.manage` permission; prices computed server-side only.
- MRI cannot see CT (and all cross-department pairs) → `queues.read.own-department` forces `user.departmentId`; scan/file/inventory services re-check the object's department.
- Report doctors see only assigned cases → every `/reports/my-cases/*` route resolves the assignment and compares `reportDoctorUserId`.
- File downloads authorized every time → signed HMAC tokens carry user + expiry; issuance re-checks assignment/department/admin permission.
- Audit logs immutable → DB triggers reject UPDATE/DELETE.
- Soft-deleted data hidden but restorable → `deletedAt` filters everywhere; `soft-delete.restore` permission + audit on restore.
- Merna connector read-only, aggregate-only, service-key gated, disabled by default.

Verified end-to-end in the live smoke flow (see `docs/ACCEPTANCE_TESTS.md`).
