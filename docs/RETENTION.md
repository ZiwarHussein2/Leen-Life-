# Data retention

| Data | Retention | Mechanism |
|---|---|---|
| Scan ZIP files | 7 days after upload, then deleted from storage | Worker `file-retention` job (hourly); `autoDeleteAfter` on the file row |
| Scan ZIPs marked **Keep** | Indefinite | `keepFile=true` clears `autoDeleteAfter`; flag changes are logged |
| Contract PDFs / agreement snapshots | Indefinite (employment records) | Never auto-deleted |
| Patient, invoice, payment, report records | Indefinite | Soft delete only (`deletedAt`); restore is audited |
| Audit / file-access / login logs | Indefinite, append-only | DB triggers reject UPDATE/DELETE |
| Notifications | Operational; safe to archive | No auto-delete implemented |

Deleted-from-storage files keep their metadata row and access history (`deletedFromStorageAt` set) so the evidence trail survives the binary deletion.

Archive strategy (spec §26.13): partitioning/archival of old operational rows is planned but **not implemented** in this build; PostgreSQL native partitioning of `audit_logs` and `inventory_movements` is the recommended first step once volumes require it.

Retention periods are configurable (`FILE_RETENTION_DAYS`) and must be confirmed by legal review before production.
