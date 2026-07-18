# Database

PostgreSQL 16; schema managed by Prisma (`packages/database/prisma/schema.prisma`); migrations committed under `prisma/migrations`.

## Model groups

- **Organization**: branches, departments (unique per branch+type), roles, permissions, role_permissions
- **Users**: users (links `supabaseUserId`), user_devices, login_logs
- **Employee portal**: employee_applications, employee_positions, work_policies (versioned per language), employee_agreements (immutable `termsSnapshot`), attendance_records (unique per employee+day)
- **Billing**: patients, invoices, invoice_items (price + rule snapshots), payments (unique `idempotencyKey`), sequence_counters
- **Catalog**: tests (trilingual names), time_price_rules
- **Referrals**: referral_partners, referral_deals (superseded, never edited in place), referral_transactions (amount snapshots)
- **Discounts**: discount_requests, discount_codes, discount_usages
- **Operations**: department_queues, queue_change_logs, scan_operations
- **Files**: files (BigInt sizes, retention fields), file_access_logs
- **Reports**: report_doctor_profiles (agreed price + tolerance), report_assignments, reports (QR token, price review fields), report_price_reviews
- **Inventory**: inventory_items, department_inventory (unique per department+item), inventory_movements, test_asset_recipes, asset_usage_records (expected/entered/verified/waste)
- **Accounting**: cashout_batches, salary_records
- **Governance**: audit_logs (append-only), notifications, security_alerts

## Integrity rules (spec §33.2)

- UUID keys everywhere; FKs on all relations; unique constraints on codes, emails, idempotency keys, per-day attendance, department+item stock rows.
- Monetary values are integer IQD.
- Historical rows (invoice items, referral transactions, agreements, report prices) are snapshots — never recalculated from later agreement changes.
- Append-only triggers on `audit_logs`, `file_access_logs`, `login_logs` (migration `20260718154500_audit_append_only`).
- Human-friendly sequential codes come from `sequence_counters` allocated inside transactions.

## Commands

```bash
pnpm db:deploy   # apply committed migrations
pnpm db:migrate  # create a new migration in development
pnpm db:seed     # idempotent synthetic seed (500 patients, ~1000 visits)
```
