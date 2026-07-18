#!/usr/bin/env bash
# Restore an encrypted backup (spec §22.7). Restores into RESTORE_DATABASE_URL —
# point it at a scratch database first to test restores regularly.
# Usage: BACKUP_PASSPHRASE=... RESTORE_DATABASE_URL=... ./restore.sh <db-backup.enc> [files-backup.enc]
set -euo pipefail

DB_ENC="${1:?Usage: restore.sh <db-backup.enc> [files-backup.enc]}"
FILES_ENC="${2:-}"
PGURL="${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL (never restore blindly over production)}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_PASSPHRASE must be set" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[1/2] Decrypting + restoring database..."
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$DB_ENC" -out "$TMP/db.dump"
pg_restore --clean --if-exists --no-owner --dbname="$PGURL" "$TMP/db.dump"

if [ -n "$FILES_ENC" ]; then
  echo "[2/2] Decrypting + restoring file storage..."
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$FILES_ENC" -out "$TMP/files.tar.gz"
  tar -xzf "$TMP/files.tar.gz" -C "${RESTORE_STORAGE_PARENT:-.}"
fi

echo "Restore complete. Run the app's smoke tests against the restored data."
