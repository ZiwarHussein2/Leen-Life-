# API

Base URL: `/api/v1`. OpenAPI docs served at `/api/docs` (Swagger UI). All endpoints require a bearer token except: `/auth/dev-login` (dev only), `/employees/signup`, `/files/download?token=` (self-authorizing signed token), `/reports/verify/:token`, `/merna-connector/*` (service-key), `/health`.

Conventions: JSON bodies validated by DTOs; standard error envelope `{statusCode, message, error}`; `x-correlation-id` echoed on every response; list endpoints paginate with `page`/`pageSize`.

## Route map

| Area | Routes |
|---|---|
| auth | `POST /auth/dev-login`, `GET /auth/me` |
| patients | `GET /patients?q=`, `GET /patients/:id`, `POST /patients`, `PATCH /patients/:id` |
| services | `GET /services`, `POST /services`, `PATCH /services/:id`, `POST /services/time-price-rules`, `GET /services/:id/price?at=` |
| invoices | `GET /invoices`, `GET /invoices/:id`, `GET /invoices/:id/receipt`, `POST /invoices`, `POST /invoices/:id/apply-code`, `POST /invoices/:id/finalize`, `POST /invoices/:id/payments` |
| discounts | `POST /discounts/requests`, `GET /discounts/requests`, `POST /discounts/requests/:id/decision`, `GET/POST /discounts/codes` |
| referrals | `GET/POST /referrals/partners`, `POST /referrals/partners/:id/deals`, `GET /referrals/partners/:id/balance`, `POST /referrals/partners/:id/cashout` |
| queues | `GET /queues?departmentId=&date=`, `POST /queues/:id/reorder` |
| scans | `POST /scans/start/:queueEntryId`, `GET /scans/:id`, `POST /scans/:id/upload` (multipart), `POST /scans/:id/scan-done`, `POST /scans/:id/printing-done`, `POST /scans/:id/asset-usage`, `POST /scans/:id/asset-usage/verify` |
| files | `POST /files/:id/signed-url`, `GET /files/download?token=`, `POST /files/:id/keep` |
| reports | `GET /reports/waiting`, `POST /reports/cases/:id/report-required`, `GET /reports/doctors`, `POST /reports/cases/:id/assign`, `GET /reports/my-cases`, `GET /reports/my-cases/:id`, `POST /reports/my-cases/:id/write`, `GET /reports/my-earnings`, `POST /reports/sonar/:queueEntryId/write`, `GET /reports/completed`, `GET /reports/:id/print-data`, `POST /reports/:id/mark-printed`, `POST /reports/:id/price-review`, `GET /reports/verify/:token` |
| inventory | `GET/POST /inventory/items`, `GET /inventory/levels`, `POST /inventory/receive`, `POST /inventory/waste`, `GET /inventory/movements`, `GET /inventory/variance`, `GET /inventory/low-stock` |
| employees | `POST /employees/signup`, `GET /employees/applications`, `POST /employees/applications/:id/review`, `POST /employees/positions`, `GET /employees/me`, `GET /employees/policies`, `POST /employees/positions/:id/accept`, `GET /employees/agreements/:id`, `POST /employees/attendance/check-in|check-out`, `GET /employees/attendance[/me]`, `POST /employees/attendance/:id/adjust` |
| accounting | `GET /accounting/summary`, `GET /accounting/department-profit`, `GET /accounting/report-doctor-balances`, `POST /accounting/report-doctors/:userId/cashout`, `POST /accounting/salaries`, `GET /accounting/salaries` |
| admin | `GET /admin/dashboard`, `GET/POST /admin/users`, `PATCH /admin/users/:id`, `GET /admin/departments`, `GET /admin/audit-logs`, `GET /admin/security-alerts`, `POST /admin/restore/:objectType/:id` |
| merna | `GET /merna-connector/v1/branch-kpis|department-performance|attendance-summary` (header `x-merna-service-key`) |

Spec §33.3 routes not yet implemented as dedicated modules: `/visits`, `/appointments`, `/orders` (folded into invoices/queues), `/expenses`, `/policies` (under `/employees/policies`), `/notifications` (delivery handled by worker; no list endpoint yet), `/security`, `/privacy` (alerts under `/admin`). See the final implementation report.
