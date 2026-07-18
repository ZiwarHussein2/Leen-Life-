# User roles — operational guide

| Role | Portal | What they do | What they can never do |
|---|---|---|---|
| GashtySoft Platform Admin | /admin | Full system administration, restores, security alerts; MFA required, fully audited | Act invisibly — every action is logged |
| Leen Life Admin | /admin | Approvals, users, HR, pricing, policies, audit review | Access GashtySoft infrastructure settings |
| Accounting | /accounting | Financial reports, price reviews, cashouts, payroll; MFA required | Manage users/departments |
| Reception | /reception | Register patients, build invoices, request discounts, take payments, print receipts/reports, assign report doctors, verify physical outputs | Apply discounts directly; change any price |
| Department Operator (MRI/CT/X-Ray/Mammo/DEXA) | /department | Own queue only: start scan, upload ZIP, enter asset counts, mark scan/printing done | See other departments' patients or inventory; touch money |
| Sonar Doctor | /sonar | Sonar queue; write and print the report directly | ZIP upload / external report assignment (not part of sonar flow) |
| Report Doctor | /doctor | Assigned cases only; download via expiring signed links; write reports and enter prices; view own earnings; MFA required | Browse patients; see others' cases; touch invoices/payments |
| Employee | /employee | Signup, accept position (exact terms snapshot), geofenced check-in/out, view own history | Any operational module until a role is assigned |
| Merna Governance | /accounting (read) | Aggregated branch summaries | Patient-level, employee-ID, location, or report data |

Demo credentials for all roles: `docs/LOCAL_DEVELOPMENT.md`.
