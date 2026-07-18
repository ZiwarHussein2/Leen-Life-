# Merna central-platform integration readiness

Merna Medical Company's central panel and **Merna AI** are separate future products. This branch build contains **no AI model integration** (spec §21); it exposes only a disabled, privacy-filtered, read-only connector.

## Connector contract

- Base: `/api/v1/merna-connector/v1/`
- Enabled only when `MERNA_CONNECTOR_ENABLED=true`; otherwise every call returns 503.
- Service-to-service auth: `x-merna-service-key` header, constant-time compared against `MERNA_CONNECTOR_SERVICE_KEY`.
- Read-only: only GET endpoints exist; there is nothing to write to.
- Aggregation by default: every response is counts/sums (revenue, invoice counts, department test totals, attendance status counts). No patient identifiers, employee identities, locations, or report bodies are reachable through the connector.
- Every request writes an audit event (`merna.connector.read`).

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET v1/branch-kpis?from=&to=` | invoices, revenue, net billed, discounts, new patients, report backlog, open alerts |
| `GET v1/department-performance?from=&to=` | per-department test counts, completions, billed totals |
| `GET v1/attendance-summary?from=&to=` | attendance record counts by status |

## Future expansion rules

New reporting domains (inventory/waste summaries, queue analytics, management activity) must keep the same properties: versioned paths, explicit scopes, masking/aggregation, audited, rate-limited, read-only first. Cross-branch comparison happens in the Merna Control Center after multiple branches connect — never by widening this connector's data granularity. Any Merna AI usage consumes these approved reporting tools; it never gets raw database access.
