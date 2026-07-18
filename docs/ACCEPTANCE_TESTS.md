# Acceptance tests

## Executed in this build (live API + seeded database)

The scripted flow (`docs/TESTING.md`) exercised and asserted these spec acceptance criteria:

**Phase 2/5 — isolation**: MRI operator's queue shows only MRI patients; CT operator cannot see the MRI patient and receives 403 trying to start the MRI scan; operator denied `/admin/users` (403).
**Phase 3 — intake**: patient created with sequential `LL-` code; invoice picked the 160,000 IQD afternoon time-price over the 150,000 base; receipt data correct; patient entered the MRI queue only after full payment.
**Phase 4 — discounts/referrals**: reception created a discount request but was 403-blocked from deciding it; finalize was blocked (409) while pending; admin approval applied the discount and recalculated totals; Dr. Ziwar's fixed 10,000 IQD referral transaction was created payable; payment idempotency replay returned the original payment.
**Phase 5 — scans**: start → asset usage entry (3 films, stock decremented) → scan done → printing done; reception verified physical outputs.
**Phase 6 — reports**: case appeared on the waiting list; assignment queued a Telegram notification (delivered by the worker in dev mode); doctor 1 saw the case, doctor 2 did not and was 403-blocked from the detail; a 50,000 IQD price (outside the 15,000±5,000 deal) was FLAGGED; accounting adjusted it to 15,000 with a reason; report printed; public QR page verified the report with a masked patient name.
**Phase 7 — sonar**: sonar patient queued after payment; sonar doctor wrote and submitted the report directly; no ZIP/assignment flow involved.
**Phase 9 — accounting**: daily summary showed the income; report-doctor balance reflected the approved price; report doctor was 403-blocked from accounting endpoints.
**Phase 11/12 — security/Merna**: signed-link tokens verified expiring/tamper-proof in unit tests; append-only audit triggers active; Merna connector returned 503 while disabled.
**Backups**: encrypted backup restored into a scratch database (501 patients).

## Remaining acceptance work

Browser-level Playwright suites for the §33.4 scenarios (employee geofence UI flow, localization rendering checks, ID-upload flow), malware-scan integration, and load testing — tracked in the final implementation report.
