# Testing

## Automated suites (executed in this build)

- **Unit — API domain** (`apps/api/test`, vitest): 54 tests over time-based pricing (inclusive/exclusive boundaries, midnight windows, active dates), invoice totals, discount codes (validity, scoping, caps), referral deals (all five types incl. share-as-discount), report price band flagging, geofence distance, attendance/lateness/overtime, payroll deductions, file retention + Keep, HMAC signed tokens (expiry/tamper), filename sanitization, ZIP safety (magic, traversal, bomb, garbage), inventory variance and stock movements.
- **Unit — state machines** (`packages/shared-types/test`, vitest): 5 tests validating every machine's closure, terminal states, and the full case-lifecycle path.
- **Live API flow test** (`scratchpad e2e-flow.mjs`, run against the booted API + seeded DB): 25 assertions covering the complete business loop — patient → time-priced invoice → referral transaction → reception blocked from approving its own discount → admin approval → finalize → idempotent payment → MRI queue isolation (CT cannot see or start the case) → scan lifecycle → asset usage entry + reception verification → report assignment → doctor-only case visibility (BOLA denial for the other doctor) → out-of-deal price flagging → accounting price review → printing + public QR verification with masked name → sonar direct flow → accounting summaries → report doctor denied accounting access → Merna connector disabled (503).
- **CI** (`.github/workflows/ci.yml`): migration deploy against fresh Postgres, seed, typecheck, unit tests, app builds, API boot smoke asserting an RBAC denial, dependency audit, secret scan.

Run locally:

```bash
pnpm --filter @leen-life/api --filter @leen-life/shared-types test
```

## Not yet automated (honest gaps)

- Browser-level Playwright E2E suites for the scenarios in spec §33.4 (the API-level flow test covers the same business logic; UI flows were smoke-tested manually/by HTTP).
- Localization rendering assertions (RTL/Noto Kufi verified by inspection, not by automated visual tests).
- Load/performance test harness (budgets defined in the spec; not yet measured).
- Malware-scan adapter integration tests (adapter is a documented hook).

These gaps are listed in `docs/FINAL_IMPLEMENTATION_REPORT.md` and should be closed before production sign-off.
