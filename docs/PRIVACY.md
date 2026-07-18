# Privacy

## Data inventory

Patient identity + visit/billing history; medical scan files (ZIP) and report texts; employee identity, ID-card images, contracts, attendance with location; financial and commission data; audit trails including IP/device metadata.

## Principles implemented

- **Minimization at the edges**: the public QR page shows only patient code, masked name, test, doctor, date — never report content. Report doctors see case-scoped patient basics, not full history. Telegram notifications carry no medical files or full identity. The Merna connector returns aggregates only.
- **Purpose-limited collection**: signup/attendance metadata (IP, device, location) is collected for legal evidence and fraud prevention and stored on the specific records, with a browser-limitation note (a browser cannot provide a true hardware ID — spec §19.1).
- **Access control**: every read of sensitive data is permission-checked; file access is logged per event.
- **Retention**: scan ZIPs auto-delete after 7 days unless Keep; business records are kept indefinitely (soft delete only) per spec — see RETENTION.md.
- **Employee transparency**: employees see and accept the exact terms snapshot; the accepted version is available to them permanently. Monitoring (attendance geofence) is declared in work policies.

## Required human review before production

This build implements mechanisms, not legal compliance. Before go-live, counsel must review: consent texts (patients + employees, in all three languages), retention periods against Iraqi/KRG law, employee monitoring notices, cross-border data flows (Supabase/Resend/Telegram hosting locations), and the Merna data-sharing agreement. Do not represent the system as legally compliant until that review is signed off.
