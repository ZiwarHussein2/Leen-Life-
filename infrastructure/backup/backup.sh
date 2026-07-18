#!/usr/bin/env bash
# Encrypted database + file-storage backup (spec §22.7).
# Usage: BACKUP_PASSPHRASE=... ./backup.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PGURL="${DATABASE_URL:-postgresql://leenlife:leenlife_dev_password@localhost:5432/leenlife}"
STORAGE_DIR="${STORAGE_DIR:-./storage-data}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_PASSPHRASE must be set (backups are always encrypted)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "[1/3] Dumping database..."
pg_dump "$PGURL" --format=custom --file="$OUT_DIR/db-$STAMP.dump"

echo "[2/3] Archiving file storage..."
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$OUT_DIR/files-$STAMP.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
else
  echo "  (no file storage dir at $STORAGE_DIR, skipping)"
fi

echo "[3/3] Encrypting..."
for f in "$OUT_DIR/db-$STAMP.dump" "$OUT_DIR/files-$STAMP.tar.gz"; do
  [ -f "$f" ] || continue
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$f.enc"
  rm "$f"
  sha256sum "$f.enc" >> "$OUT_DIR/checksums-$STAMP.txt"
done

echo "Backup complete: $OUT_DIR (stamp $STAMP)"
echo "Verify with restore.sh on a scratch database before trusting it."
