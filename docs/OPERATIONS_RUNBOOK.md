# Operations runbook

## Daily

- Check admin dashboard: pending discounts, report backlog, attendance issues, low stock, open security alerts.
- Accounting reviews the variance report (`/inventory/variance`) and flagged report prices.

## Health checks

- API: `GET /health` → `{status:"ok"}`. Web: `GET /login` → 200. Worker: container logs show scheduled job output; Redis `PING`.
- Database: `pg_isready`; disk usage on the postgres and file-storage volumes.

## Common operations

| Task | How |
|---|---|
| Restart a service | `docker compose -f infrastructure/docker/docker-compose.prod.yml restart api` |
| Apply new migrations | `docker compose exec api sh -c "cd packages/database && npx prisma migrate deploy"` |
| Run a job manually | `docker compose exec worker node apps/worker/dist/main.js --run file-retention` |
| Suspend a user | Admin portal → Users → status SUSPENDED |
| Restore soft-deleted record | `POST /api/v1/admin/restore/:objectType/:id` (audited) |
| Rotate signed-link secret | Update `FILE_SIGNING_SECRET`, restart api (old links expire immediately) |
| Backup / restore | See BACKUP_AND_RESTORE.md |

## Monitoring to configure for production

Uptime probe on `/health` and the login page; disk/memory alerts; postgres connection saturation; worker job failure alerts (FAILED notifications, retention errors in logs); certificate expiry (Caddy usually self-manages).

## Log locations

Structured app logs to container stdout (`docker compose logs -f api`). Business events: `audit_logs`. Deliveries: `notifications.status`. Never log secrets or medical payloads.
