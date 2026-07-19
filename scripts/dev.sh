#!/usr/bin/env bash
# One-command local bootstrap: installs, starts infrastructure, migrates,
# seeds, and runs the API + web app. Idempotent — safe to re-run.
#   ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Corepack downloads pnpm on first use; skip its interactive prompt.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

say() { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

command -v docker >/dev/null || { echo "ERROR: Docker is required (start Docker Desktop)"; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: Docker daemon is not running (start Docker Desktop)"; exit 1; }
command -v pnpm >/dev/null || corepack enable

say "Installing dependencies"
pnpm install

say "Starting PostgreSQL / Redis / MinIO"
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

say "Waiting for PostgreSQL"
for i in $(seq 1 30); do
  docker compose -f infrastructure/docker/docker-compose.dev.yml exec -T postgres pg_isready -U leenlife >/dev/null 2>&1 && break
  sleep 1
  [ "$i" = 30 ] && { echo "ERROR: PostgreSQL did not become ready"; exit 1; }
done

[ -f .env ] || { say "Creating .env from template"; cp .env.example .env; }
# Migrate a .env created before the dev database moved to host port 55432.
if grep -q "leenlife_dev_password@localhost:5432/" .env; then
  say "Updating .env database port to 55432"
  sed -i.bak 's|leenlife_dev_password@localhost:5432/|leenlife_dev_password@localhost:55432/|' .env && rm -f .env.bak
fi
set -a; . ./.env; set +a

say "Building shared packages"
pnpm --filter @leen-life/shared-types --filter @leen-life/permissions --filter @leen-life/database build

say "Generating Prisma client"
pnpm --filter @leen-life/database generate

say "Applying database migrations"
pnpm db:deploy

say "Seeding synthetic data (idempotent)"
pnpm db:seed

say "Building API and worker"
pnpm --filter @leen-life/api --filter @leen-life/worker build

say "Starting API (:3001), worker, and web (:3500) — Ctrl-C stops everything"
trap 'kill 0' EXIT INT TERM
node apps/api/dist/main.js &
node apps/worker/dist/main.js &
pnpm --filter @leen-life/web dev &

sleep 4
printf "\n\033[1m✓ Leen Life is up\033[0m\n"
printf "  Web:      http://localhost:3500  (login: admin@leenlife.test / leenlife-dev)\n"
printf "  API:      http://localhost:3001  (docs: http://localhost:3001/api/docs)\n"
printf "  Accounts: docs/LOCAL_DEVELOPMENT.md\n\n"
wait
