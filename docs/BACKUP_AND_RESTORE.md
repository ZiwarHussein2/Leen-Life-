# Backup and restore

Scripts: `infrastructure/backup/backup.sh` and `restore.sh`.

- Backup dumps PostgreSQL (`pg_dump --format=custom`) and archives the file storage directory, then encrypts both with AES-256-CBC (PBKDF2) using `BACKUP_PASSPHRASE`, and records SHA-256 checksums. Unencrypted intermediates are removed.
- Restore decrypts and `pg_restore`s into `RESTORE_DATABASE_URL` — deliberately a separate variable so a restore can never silently target production.

```bash
BACKUP_PASSPHRASE=... DATABASE_URL=... STORAGE_DIR=... ./backup.sh /backups
BACKUP_PASSPHRASE=... RESTORE_DATABASE_URL=postgres://.../scratch ./restore.sh /backups/db-<stamp>.dump.enc
```

Verified in this build: a full backup of the seeded database was encrypted, restored into a scratch database, and row counts confirmed (501 patients).

Operational policy (to configure in production): nightly cron, off-host encrypted destination, checksum verification on arrival, monthly restore drill into a scratch database, alert on backup job failure (job success/failure rows appear in `audit_logs` when run via the worker host cron wrapper).

Disaster recovery: infrastructure is fully described by the compose files; recovery = provision host → restore latest backup → deploy stack → run smoke tests. Keep `BACKUP_PASSPHRASE` in a separate secret store from the backups themselves.
