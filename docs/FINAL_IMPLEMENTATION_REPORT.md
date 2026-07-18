# Final implementation report

**Project**: Leen Life Operations Platform (Phase 1 branch: Leen Life Medical Complex, Erbil)
**Owner**: GashtySoft — Software Division of Gashty Limited HK / parent: Merna Medical Company
**Build date**: 2026-07-18 · **Branch**: `claude/markdown-prompt-build-l4aem5`

This is a factual status report. It does not claim production readiness — see "Production gate" below.

## Completed modules

| Area | Status | Notes |
|---|---|---|
| Monorepo + tooling | ✅ | pnpm workspaces, TS strict, prettier, CI |
| Database schema + migrations | ✅ | ~45 Prisma models, FKs/uniques, append-only audit triggers, soft deletes, snapshots |
| RBAC + permissions | ✅ | 9 roles, 50+ permission keys, matrix seeded and enforced server-side; MFA-required roles |
| State machines | ✅ | 15 machines; invalid transitions rejected by the API; tested |
| Auth | ✅ (dev path live) | Supabase JWT verification implemented; dev-login for local/tests; live Supabase project not yet configured |
| Patients / invoices / payments | ✅ | Sequential codes, server-side price snapshots, time-based MRI/CT pricing, idempotent payments, queue fan-out on full payment |
| Discounts | ✅ | Request→approve workflow (reception cannot self-approve), codes with scoping/limits |
| Referral partners | ✅ | All 5 deal types incl. share-as-discount; snapshot transactions; balances; cashouts |
| Department queues | ✅ | Full isolation, priority ordering, reasoned + logged reorders |
| Scan operations | ✅ | Start/scan-done/printing-done lifecycle mirrored onto cases; report-required branching |
| File handling | ✅ | Private storage, randomized keys, ZIP validation (bomb/traversal), signed expiring links, access logging, 7-day retention + Keep |
| Reports | ✅ | Waiting list, assignment + Telegram queue, doctor portal (assigned-only), editor with drafts, price flagging vs deal band, accounting review, printing, public QR verification with masking |
| Sonar direct workflow | ✅ | Queue → direct editor → submit/print; no ZIP/assignment |
| Inventory | ✅ | Per-department stock, receiving, waste, recipes, entered-vs-verified variance, low-stock alerts |
| Accounting | ✅ | Daily/period summaries, department profit (income − inventory − report costs), doctor balances, cashout batches, attendance-driven payroll |
| Employee portal | ✅ | Signup with metadata capture, admin review, job assignment, immutable terms-snapshot agreements, geofenced attendance with adjustment audit |
| Admin portal | ✅ | KPI dashboard, users, discount approvals, HR, audit log viewer, security alerts, soft-delete restore |
| Worker jobs | ✅ | Retention sweep, notification delivery (Telegram/Resend with dev mode), low-stock, suspicious attendance/waste/login sweeps, daily summary |
| Web app (all portals) | ✅ | Next.js 15; EN/AR/Kurdish Sorani with Noto Kufi Arabic + RTL; getdesign vercel foundation; production build passes |
| Merna connector | ✅ | Disabled by default, service-key, read-only aggregates, audited; **no AI model integrated** |
| Infrastructure | ✅ | Dev + prod compose, Dockerfiles, Caddy subdomain proxy, CI pipeline, encrypted backup/restore |
| Documentation | ✅ | 20 docs + README + .env.example |

## Test results (actually executed)

- **Unit tests: 59/59 passing** — 54 API domain tests (pricing incl. boundary/midnight cases, discounts, referrals, price bands, geofence, payroll, retention, signed tokens, filename sanitization, ZIP safety incl. constructed bomb/traversal fixtures, inventory variance) + 5 state-machine tests. One test was adjusted during the build: the ZIP-bomb fixture is rejected by yauzl's consistency checks before the size limit triggers — the assertion now accepts either rejection reason (the bomb is blocked either way).
- **Live end-to-end API flow: 25/25 assertions passing** against the booted API + seeded database, covering the full reception→department→report→accounting loop and the security denials (department isolation, BOLA, discount self-approval, accounting access, disabled connector). Details: `docs/ACCEPTANCE_TESTS.md`.
- **Web**: production build passes; login page, portals, and the SSR QR verification page (genuine + rejected token) verified over HTTP.
- **Worker**: retention, notification delivery (delivered the real queued Telegram notification in dev mode), and daily-summary jobs executed one-shot successfully.
- **Backup/restore**: encrypted backup created and restored into a scratch database; 501 patients round-tripped.
- **Migrations**: applied from scratch twice (dev machine + restore test); CI re-validates on every push.

## Known limitations (honest)

1. **Server-side PDF generation is not implemented** — receipts/reports/contracts print via browser print of styled HTML; contract terms are stored as immutable snapshots but not yet rendered to stored PDF files (spec asked for Playwright-based server PDFs). Design documented in `docs/PDF_TEMPLATES.md`.
2. **No browser-level Playwright E2E suite** — the §33.4 scenarios were verified at the API level plus manual/HTTP UI smoke tests, not as automated browser tests.
3. **Malware scanning** is a documented hook, not a wired scanner; ZIP structural validation is implemented.
4. **S3/MinIO storage adapter** not wired (local-disk adapter is live; interface is the seam).
5. **Live Supabase / Resend / Telegram credentials** not configured — dev modes simulate them; the production code paths exist but are unexercised against real services.
6. **Some spec API domains folded or deferred**: /visits and /appointments are represented by invoices+queues; /expenses (general expense ledger), a notifications list endpoint, ID-card upload UI in the employee portal, dedicated /security and /privacy endpoints are not built.
7. **Localization coverage**: core flows translated in all three languages; some operational labels remain English-only; date/number localization and automated RTL tests pending.
8. **Performance budgets** defined but not measured; no load test harness yet.
9. **Employee OTP** flow relies on Supabase in production; the dev signup skips real email verification.

## Unresolved legal decisions

Consent/policy texts (3 languages), retention periods, employee monitoring notices, cross-border processing (Supabase/Resend/Telegram), Merna data-sharing agreement — all require counsel review (see `docs/PRIVACY.md`).

## Production gate

The system must not be treated as production-ready until: legal/privacy sign-off; production infrastructure hardened (real domains/TLS/WAF, `AUTH_DEV_MODE=false`); Supabase (with MFA), Resend, and Telegram configured and tested; malware scanner integrated; backup restore verified on production infrastructure; independent penetration test passed; final acceptance testing signed off by Leen Life administration.

## Exact commands

Local run: `docs/LOCAL_DEVELOPMENT.md`. Deploy: `docs/DEPLOYMENT.md`. Tests: `pnpm --filter @leen-life/api --filter @leen-life/shared-types test`.
