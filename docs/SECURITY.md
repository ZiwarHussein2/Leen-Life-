# Security

Checklist reference: OWASP ASVS + OWASP API Security (BOLA).

## Implemented controls

- **AuthN**: Supabase Auth (production) with JWT verification server-side; MFA enforced for PLATFORM_ADMIN, BRANCH_ADMIN, ACCOUNTING, REPORT_DOCTOR (403 without `aal2`). Login attempts logged (`login_logs`, append-only); brute-force sweep raises alerts at ≥5 failures/hour.
- **AuthZ**: RBAC + department scoping + object-level checks on every request (see AUTHORIZATION.md). Frontend hiding is never relied on.
- **Rate limiting**: global throttler (default 120 req/min, configurable).
- **Headers**: nosniff, DENY framing, no-referrer, HSTS in production; CORS restricted to configured origins.
- **Input validation**: class-validator DTOs with whitelist + forbidNonWhitelisted on all endpoints; Prisma parameterized queries (no string SQL from user input).
- **File security** (spec §22.5): private storage only; randomized server-side keys; sanitized original names stored as metadata; size limits; ZIP magic check; ZIP validation without extraction (entry count, declared decompressed size, compression ratio, path traversal/absolute path rejection); HMAC-signed expiring download links (default 15 min); every upload/download/delete/keep-flag logged; 7-day auto-delete unless Keep.
- **Audit**: append-only `audit_logs` (+ file access and login logs) protected by DB triggers; sensitive actions log actor, role, object, old/new values, IP, device, reason. Financial mutations write their audit row inside the same transaction.
- **Idempotency**: payment recording is idempotent by key; sequential codes allocated transactionally.
- **Soft delete**: protected records only hidden; restore is permission-gated and audited.
- **Internal abuse**: discount approval workflow, reception verification of department-entered asset counts, expected/entered/verified variance reporting, waste anomaly alerts, queue reorders require a reason and are logged, report price deviation flagging, geofence-rejected attendance alerts.
- **Secrets**: environment variables only; `.env` git-ignored; CI secret scan (gitleaks).
- **Merna connector**: disabled by default, service-key (constant-time compare), aggregates only, read-only, audited.

## Known gaps / required before production

- **Malware scanning**: ZIP structural validation is implemented; a real antivirus (e.g. ClamAV container on the private network) must be wired into the upload pipeline hook before production.
- **Supabase MFA**: enforced via the `aal` claim; a live Supabase project with MFA enrollment must be configured and tested.
- **Refresh-token/session hardening** happens in Supabase configuration (session TTL, refresh rotation) — configure per environment.
- **TLS/WAF/DDoS**: Caddy provides TLS; a WAF/CDN layer is recommended in front for production.
- **Independent penetration test**: required before go-live. This document lists implemented controls; it is not a claim of "fully secure" or "bank-level" security.

## Incident response

See `docs/INCIDENT_RESPONSE.md`. Security alerts are surfaced in the admin portal and stored in `security_alerts`.
