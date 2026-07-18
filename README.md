# Leen Life Operations Platform

Full-stack healthcare operations platform for **Leen Life Medical Complex (Erbil)** — the first branch of the **Merna Medical Company** ecosystem, built by **GashtySoft** (Software Division of Gashty Limited HK).

Covers radiology operations (Sonar, MRI, CT, X-Ray, Mammography, DEXA), reception/patient intake, invoicing with time-based pricing, discount approval workflows, referral partner deals, remote report doctors, per-department inventory and waste tracking, accounting, employee portal with geofenced attendance, append-only audit logging, and a privacy-filtered read-only connector prepared for the future Merna central platform.

> This is an internal healthcare/business system, **not** a public booking site. Security, permissions, and audit logging are first-class concerns. See `docs/SECURITY.md` and `docs/AUTHORIZATION.md`.

## Monorepo layout

```text
apps/
  web/        Next.js frontend (all portals; EN / AR / Kurdish Sorani, RTL)
  api/        NestJS backend API (/api/v1, versioned, OpenAPI)
  worker/     BullMQ background jobs (file retention, notifications, summaries)
packages/
  database/       Prisma schema, migrations, deterministic synthetic seed
  shared-types/   Shared enums, DTO types, state machines
  permissions/    Permission keys, role definitions, RBAC matrix
  localization/   i18n message catalogs (en, ar, ku)
infrastructure/
  docker/     Docker Compose for local/staging (Postgres, Redis, MinIO, apps)
  proxy/      Reverse proxy configuration (subdomain routing)
  backup/     Backup / restore scripts
docs/         Architecture, security, operations, and handover documentation
```

## Quick start (local development)

Prerequisites: Node.js ≥ 20, pnpm ≥ 9, Docker.

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# 3. Configure environment
cp .env.example .env

# 4. Apply database migrations and seed synthetic data
pnpm db:deploy
pnpm db:seed

# 5. Run everything
pnpm dev
# web:    http://localhost:3000
# api:    http://localhost:3001  (OpenAPI docs at /api/docs)
```

Seeded demo accounts (synthetic data only — see `docs/ACCEPTANCE_TESTS.md`): admin, accounting, reception, one operator per department, sonar doctor, report doctors, and employees.

## Documentation

Start with `docs/ARCHITECTURE.md`, then `docs/LOCAL_DEVELOPMENT.md`. The full documentation index is in `docs/`.

## Status

See `docs/FINAL_IMPLEMENTATION_REPORT.md` for the factual build status, executed test results, and known limitations. This system must **not** be treated as production-ready until legal/privacy review, production hardening, external credential configuration, verified backup restore, and independent security review are complete.

## Ownership

The system is GashtySoft property under the applicable signed commercial agreement. Synthetic test data only — no real patient, employee, doctor, shareholder, or financial information may be placed in this repository.
