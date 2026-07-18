# Environment variables

See `.env.example` for the authoritative template. Summary:

| Variable | Used by | Notes |
|---|---|---|
| DATABASE_URL | api, worker, database | PostgreSQL connection |
| API_PORT / API_BASE_URL / APP_BASE_URL | api, web | Ports and origins |
| CORS_ORIGINS | api | Comma-separated allowed origins |
| SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_JWT_SECRET | api, web | Identity provider (production) |
| AUTH_DEV_MODE / AUTH_DEV_JWT_SECRET / AUTH_DEV_PASSWORD | api | Local dev login; **must be false/unset in production** |
| RESEND_API_KEY / EMAIL_FROM / EMAIL_DEV_MODE | worker | Transactional email |
| TELEGRAM_BOT_TOKEN / TELEGRAM_DEV_MODE | worker | Report-doctor notifications |
| REDIS_URL | api, worker | BullMQ |
| STORAGE_DIR | api, worker | Private file storage root (local adapter) |
| S3_* | api (future adapter) | MinIO/S3 configuration |
| FILE_MAX_UPLOAD_MB / FILE_RETENTION_DAYS / SIGNED_URL_EXPIRY_SECONDS / FILE_SIGNING_SECRET | api | File lifecycle + signed links |
| ZIP_MAX_ENTRIES / ZIP_MAX_DECOMPRESSED_MB | api | ZIP-bomb limits |
| GEOFENCE_LAT / GEOFENCE_LNG / GEOFENCE_RADIUS_METERS | api | Attendance geofence |
| RATE_LIMIT_WINDOW_SECONDS / RATE_LIMIT_MAX_REQUESTS | api | Throttling |
| SESSION_TIMEOUT_MINUTES | web/Supabase | Session policy |
| QR_VERIFICATION_BASE_URL | api | Public verify URL base |
| MERNA_CONNECTOR_ENABLED / MERNA_CONNECTOR_SERVICE_KEY | api | Future Merna connector (default disabled) |
| POSTGRES_PASSWORD / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD | compose | Infrastructure secrets |

Never commit real values; production secrets belong in an env file outside git or a secret manager.
