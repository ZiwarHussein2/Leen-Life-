# Architecture

## Overview

Leen Life is a TypeScript monorepo with three deployable apps sharing four packages:

```text
Browser (all portals, EN/AR/KU, RTL)
   │  same-origin /api/v1 (Next.js rewrite in dev; Caddy in prod)
   ▼
apps/web  (Next.js 15)  ──►  apps/api (NestJS)  ──►  PostgreSQL 16 (main DB)
                                  │                    Redis (BullMQ)
                                  │                    Private file storage
                                  ▼
                             apps/worker (BullMQ jobs)
```

- **apps/web** — all portals (reception, departments, sonar, report doctor, admin, accounting, employee) plus the public QR verification page. Pure client of the API; holds no business rules.
- **apps/api** — the only writer to the database. Every route passes: throttler → JWT auth guard → permission guard → service-level department/object checks. All prices, discounts, and states are computed server-side.
- **apps/worker** — scheduled jobs: file retention (7-day delete unless Keep), notification delivery (Telegram/Resend), low-stock alerts, suspicious attendance/waste/login sweeps, daily summaries.
- **packages/database** — Prisma schema (≈45 models), migrations (incl. append-only audit triggers), deterministic synthetic seed.
- **packages/permissions** — permission keys, 9 roles, role→permission matrix, MFA-required roles. Single source of truth; seeded into the DB and enforced by the API.
- **packages/shared-types** — 15 explicit workflow state machines (invalid transitions rejected server-side), locales, API envelopes.
- **packages/localization** — en/ar/ku message catalogs used by the web app.

## Identity vs. authorization

Supabase Auth is identity only (login, OTP, password reset, MFA). The API verifies the Supabase JWT, then loads the local `users` row and derives role/branch/department/permissions from the database — client claims are never trusted for authorization. `AUTH_DEV_MODE=true` enables a local HS256 dev-login path for development and tests; it must be false in production.

## Key invariants

- **Department isolation**: department-scoped roles are forced onto their own department server-side; queue/scan/inventory/file access all re-check the department on the object.
- **Financial snapshots**: invoice items snapshot base price, applied time-price rule, and referral deal outcome at sale time. Later price/deal changes never rewrite history.
- **Idempotency**: payments accept an `idempotencyKey`; replays return the original result.
- **Soft delete**: protected records carry `deletedAt`; restore is permission-gated and audited. Audit/file-access/login logs are append-only via DB triggers.
- **State machines**: every workflow transition is validated against `packages/shared-types/src/state-machines.ts`.

## Subdomains

All spec subdomains (mri., ct., reception., …) route through the proxy to the same web+API pair (see `infrastructure/proxy/Caddyfile`). Subdomains are cosmetic entry points; isolation is backend-enforced.

## Merna connector

`/api/v1/merna-connector/v1/*` is disabled unless `MERNA_CONNECTOR_ENABLED=true`, requires the `x-merna-service-key` header (constant-time compared), returns aggregates only, audits every request, and has no write endpoints. No AI model is integrated in this branch build (spec §21).
