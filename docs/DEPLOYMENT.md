# Deployment

## Stack

`infrastructure/docker/docker-compose.prod.yml` runs: Caddy (public, TLS), web, api, worker, PostgreSQL, Redis, MinIO — the databases and worker on the private network only.

## Steps

1. Provision a host with Docker; lock down SSH (key-only, no passwords).
2. Create `infrastructure/docker/.env.production` from `.env.example` with real values: `POSTGRES_PASSWORD`, `SUPABASE_URL/JWT_SECRET`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `FILE_SIGNING_SECRET`, geofence coordinates, `AUTH_DEV_MODE=false`, `EMAIL_DEV_MODE=false`, `TELEGRAM_DEV_MODE=false`.
3. Point DNS for the portal subdomains (see `infrastructure/proxy/Caddyfile`) at the host; Caddy auto-provisions certificates.
4. `docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --build`
5. Apply migrations + seed reference data (roles/permissions/departments only — **never** the synthetic patients in production):
   `docker compose exec api sh -c "cd packages/database && npx prisma migrate deploy"`
6. Configure Supabase: custom SMTP via Resend, MFA enrollment for high-risk roles, session TTLs.
7. Schedule `infrastructure/backup/backup.sh` (cron) with an off-host encrypted destination; test `restore.sh` against a scratch database monthly.
8. Smoke test: `/health`, login, one full reception→department→report flow, RBAC denials.

## Production gate (do not skip)

AUTH_DEV_MODE off · legal/privacy texts approved · malware scanner wired · independent security review done · backup restore verified · monitoring/alerting configured (`docs/OPERATIONS_RUNBOOK.md`). CI (`.github/workflows/ci.yml`) must be green; production deploys require manual approval — no direct unreviewed deployment.
