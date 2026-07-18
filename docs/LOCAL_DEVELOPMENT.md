# Local development

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9 (`corepack enable`)
- Docker (for PostgreSQL, Redis, MinIO)

## Setup

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
cp .env.example .env               # defaults work for local dev
pnpm --filter @leen-life/shared-types --filter @leen-life/permissions --filter @leen-life/database build
pnpm db:deploy                     # apply migrations
pnpm db:seed                       # deterministic synthetic data
```

## Running

```bash
# API (build + run; NestJS needs tsc's decorator metadata)
pnpm --filter @leen-life/api dev          # http://localhost:3001 (docs at /api/docs)

# Web
pnpm --filter @leen-life/web dev          # http://localhost:3000

# Worker (scheduled) or one-shot jobs
pnpm --filter @leen-life/worker dev
node apps/worker/dist/main.js --run file-retention
```

## Demo accounts (synthetic)

All seeded accounts sign in through the dev login with password `leenlife-dev` (`AUTH_DEV_PASSWORD`):

| Email | Role |
|---|---|
| platform@gashtysoft.test | GashtySoft platform admin |
| admin@leenlife.test | Leen Life admin |
| accounting@leenlife.test | Accounting |
| reception1@leenlife.test | Reception |
| mri@ / ct@ / xray@ / mammography@ / dexa@leenlife.test | Department operators |
| sonar@leenlife.test | Sonar doctor |
| reportdoc1@ / reportdoc2@leenlife.test | Report doctors |
| employee1@leenlife.test | Employee portal |
| merna@merna.test | Merna governance (aggregates only) |

## Tests

```bash
pnpm --filter @leen-life/api test            # domain unit tests
pnpm --filter @leen-life/shared-types test   # state machine tests
```

## Gotchas

- Run the API from compiled output (`dist/`); `tsx` does not emit decorator metadata, which breaks NestJS dependency injection.
- The seed is idempotent — re-running it does not duplicate data.
- `pnpm db:migrate` (migrate dev) is for creating new migrations; `pnpm db:deploy` only applies existing ones.
