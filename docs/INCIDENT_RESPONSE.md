# Incident response

## Detection

- `security_alerts` table + admin portal panel: login brute-force (≥5 failures/hour), geofence-rejected attendance, waste anomalies, low stock.
- Append-only audit trail (`audit_logs`), file access logs, and login logs for investigation.
- Worker sweeps run on schedules (see `apps/worker/src/main.ts`).

## Response playbook

1. **Triage** the alert in the admin portal; set it to INVESTIGATING (state machine: OPEN → INVESTIGATING → RESOLVED/DISMISSED).
2. **Contain**: suspend the implicated account (`PATCH /admin/users/:id` → SUSPENDED — takes effect on next request), rotate `FILE_SIGNING_SECRET` if signed links may be exposed, rotate the Merna service key if connector abuse is suspected.
3. **Investigate** via audit logs filtered by user/object/action; file access logs show every download with IP/device.
4. **Recover**: restore soft-deleted records via `/admin/restore/...`; restore from encrypted backups for data corruption (see BACKUP_AND_RESTORE.md).
5. **Report**: record the incident and outcome; patient-data breaches require legal notification review (counsel decision — see PRIVACY.md).

## Contacts and severity

Define on deployment: on-call owner (GashtySoft), Leen Life admin contact, legal counsel. Severity guide: CRITICAL = confirmed data breach/ransomware; HIGH = credible unauthorized access; MEDIUM = anomalies (default for automated alerts); LOW = policy deviations.
