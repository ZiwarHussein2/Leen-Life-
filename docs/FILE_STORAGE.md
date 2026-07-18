# File storage

## Model

Files are referenced by UUID (`files` table); the storage key is derived server-side (`<type>/<2-char shard>/<uuid>`) — never from client input. The web server never serves files directly; every byte flows through the API after authorization.

## Adapters

- **Local disk** (default): `STORAGE_DIR` (compose volume `file-storage`). Path resolution refuses traversal outside the root.
- **S3/MinIO**: the `StorageService` interface (`moveIntoStorage`, `createReadStream`, `delete`, `exists`) is the seam for an S3 implementation using the `S3_*` env vars; MinIO ships in the compose stacks. Not yet wired — local disk is the working adapter in this build.

## Lifecycle

upload (multer temp file) → validation (size, type; for ZIPs: magic bytes, entry count, declared decompressed size, compression ratio, unsafe paths) → move into private storage → DB row with `autoDeleteAfter = now + FILE_RETENTION_DAYS` (scan ZIPs only) → access via HMAC-signed expiring links (`SIGNED_URL_EXPIRY_SECONDS`, default 15 min) → hourly worker sweep deletes due files (Keep flag exempts; metadata and access logs survive as evidence).

Every upload, signed-link issuance, download, deletion, and keep-flag change writes a `file_access_logs` row (append-only) plus an audit event.

Documents (contracts, report PDFs, ID cards) never auto-delete.
