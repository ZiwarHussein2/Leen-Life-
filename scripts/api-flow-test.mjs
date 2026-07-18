/**
 * Live API business-flow test (25 assertions). Requires a running API
 * (AUTH_DEV_MODE=true) with the seeded database.
 * Run: node scripts/api-flow-test.mjs
 */
const API = "http://localhost:3001/api/v1";
let failures = 0;

async function call(method, path, { token, body, expectStatus } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (expectStatus && res.status !== expectStatus) {
    failures++;
    console.log(`  FAIL ${method} ${path} -> ${res.status} (expected ${expectStatus}):`, String(text).slice(0, 200));
  }
  return { status: res.status, json };
}

async function login(email) {
  const { json } = await call("POST", "/auth/dev-login", {
    body: { email, devPassword: "leenlife-dev" },
    expectStatus: 201,
  });
  return json.accessToken;
}

const ok = (label, cond) => {
  if (cond) console.log(`  ok: ${label}`);
  else { failures++; console.log(`  FAIL: ${label}`); }
};

// ── Logins ──
const reception = await login("reception1@leenlife.test");
const admin = await login("admin@leenlife.test");
const mri = await login("mri@leenlife.test");
const ct = await login("ct@leenlife.test");
const doctor = await login("reportdoc1@leenlife.test");
const sonar = await login("sonar@leenlife.test");
const accounting = await login("accounting@leenlife.test");
console.log("1. Logins done");

// ── Reception: create patient ──
const patient = (await call("POST", "/patients", {
  token: reception,
  body: { fullName: "E2E Test Patient", yearOfBirth: 1990, phone: "07501112233", address: "Erbil" },
  expectStatus: 201,
})).json;
ok("patient created with code", /^LL-\d{6}$/.test(patient.patientCode));

// ── Find MRI test + referral partner ──
const services = (await call("GET", "/services", { token: reception, expectStatus: 200 })).json;
const mriTest = services.find((s) => s.code === "MRI-BRAIN");
const partners = (await call("GET", "/referrals/partners", { token: reception, expectStatus: 200 })).json;
const drZiwar = partners.find((p) => p.name.startsWith("Dr. Ziwar"));

// ── Create invoice with referral ──
const invoice = (await call("POST", "/invoices", {
  token: reception,
  body: { patientId: patient.id, referralPartnerId: drZiwar.id, items: [{ testId: mriTest.id }] },
  expectStatus: 201,
})).json;
ok("invoice has time-based price snapshot", invoice.items[0].finalPrice > 0);
ok("referral transaction created", invoice.referralTransactions.length === 1);
console.log(`   price applied: ${invoice.items[0].finalPrice} (base ${invoice.items[0].basePrice})`);

// ── Reception CANNOT approve discounts ──
const dr = (await call("POST", "/discounts/requests", {
  token: reception,
  body: { invoiceId: invoice.id, reason: "Regular customer", requestedAmount: 10000 },
  expectStatus: 201,
})).json;
await call("POST", `/discounts/requests/${dr.id}/decision`, {
  token: reception,
  body: { decision: "APPROVED" },
  expectStatus: 403,
});
ok("reception blocked from approving discount", true);

// Finalize should fail while pending
await call("POST", `/invoices/${invoice.id}/finalize`, { token: reception, expectStatus: 409 });

// ── Admin approves ──
await call("POST", `/discounts/requests/${dr.id}/decision`, {
  token: admin,
  body: { decision: "APPROVED" },
  expectStatus: 201,
});
const afterDiscount = (await call("GET", `/invoices/${invoice.id}`, { token: reception, expectStatus: 200 })).json;
ok("discount applied to invoice", afterDiscount.discountTotal >= 10000);

// ── Finalize + pay ──
const payKey = `e2e-pay-1-${Date.now()}`;
await call("POST", `/invoices/${invoice.id}/finalize`, { token: reception, expectStatus: 201 });
const pay = (await call("POST", `/invoices/${invoice.id}/payments`, {
  token: reception,
  body: { amount: afterDiscount.netTotal, idempotencyKey: payKey },
  expectStatus: 201,
})).json;
ok("payment recorded, invoice PAID", pay.paymentStatus === "PAID");
// Idempotent replay
const replay = (await call("POST", `/invoices/${invoice.id}/payments`, {
  token: reception,
  body: { amount: afterDiscount.netTotal, idempotencyKey: payKey },
  expectStatus: 201,
})).json;
ok("payment idempotency replay detected", replay.replayed === true);

// ── Queue isolation ──
const mriQueue = (await call("GET", "/queues", { token: mri, expectStatus: 200 })).json;
const entry = mriQueue.find((q) => q.patient.id === patient.id);
ok("patient appears in MRI queue", !!entry);
const ctQueue = (await call("GET", "/queues", { token: ct, expectStatus: 200 })).json;
ok("CT operator does NOT see the MRI patient", !ctQueue.some((q) => q.patient.id === patient.id));

// CT operator cannot start an MRI queue entry (BOLA test)
await call("POST", `/scans/start/${entry.id}`, { token: ct, expectStatus: 403 });
ok("CT operator blocked from starting MRI scan", true);

// ── MRI operator runs the scan ──
const scan = (await call("POST", `/scans/start/${entry.id}`, { token: mri, expectStatus: 201 })).json;
// Asset usage entry (films)
const invItems = (await call("GET", "/inventory/items", { token: mri, expectStatus: 200 })).json;
const film = invItems.find((i) => i.nameEn.includes("Film"));
await call("POST", `/scans/${scan.id}/asset-usage`, {
  token: mri,
  body: { entries: [{ inventoryItemId: film.id, quantity: 3 }] },
  expectStatus: 201,
});
await call("POST", `/scans/${scan.id}/scan-done`, { token: mri, expectStatus: 201 });
await call("POST", `/scans/${scan.id}/printing-done`, { token: mri, expectStatus: 201 });
console.log("6. Scan flow complete");

// ── Reception verifies physical assets (edits count) ──
await call("POST", `/scans/${scan.id}/asset-usage/verify`, {
  token: reception,
  body: { entries: [{ inventoryItemId: film.id, quantity: 3 }] },
  expectStatus: 201,
});

// ── Report flow ──
const waiting = (await call("GET", "/reports/waiting", { token: reception, expectStatus: 200 })).json;
const waitingCase = waiting.find((w) => w.invoice.patient.id === patient.id);
ok("case is on report waiting list", !!waitingCase);
const doctors = (await call("GET", "/reports/doctors", { token: reception, expectStatus: 200 })).json;
const doc1 = doctors.find((d) => d.fullName.includes("One"));
const assignment = (await call("POST", `/reports/cases/${waitingCase.id}/assign`, {
  token: reception,
  body: { doctorUserId: doc1.id },
  expectStatus: 201,
})).json;

// Doctor sees only their case; doctor2 must NOT see it
const myCases = (await call("GET", "/reports/my-cases", { token: doctor, expectStatus: 200 })).json;
ok("doctor sees assigned case", myCases.some((c) => c.id === assignment.id));
const doctor2 = await login("reportdoc2@leenlife.test");
const cases2 = (await call("GET", "/reports/my-cases", { token: doctor2, expectStatus: 200 })).json;
ok("other doctor does not see the case", !cases2.some((c) => c.id === assignment.id));
await call("GET", `/reports/my-cases/${assignment.id}`, { token: doctor2, expectStatus: 403 });
ok("other doctor blocked from case detail (BOLA)", true);

// Doctor writes + submits with out-of-deal price (should flag)
const report = (await call("POST", `/reports/my-cases/${assignment.id}/write`, {
  token: doctor,
  body: { reportText: "MRI brain: no acute abnormality.", reportPrice: 50000, submit: true },
  expectStatus: 201,
})).json;
ok("out-of-deal price flagged for review", report.priceReviewStatus === "FLAGGED");

// Accounting reviews price
await call("POST", `/reports/${report.id}/price-review`, {
  token: accounting,
  body: { approvedPrice: 15000, reason: "Standard MRI rate per agreement" },
  expectStatus: 201,
});

// Reception prints; QR verification is public and privacy-filtered
const printData = (await call("GET", `/reports/${report.id}/print-data`, { token: reception, expectStatus: 200 })).json;
await call("POST", `/reports/${report.id}/mark-printed`, { token: reception, expectStatus: 201 });
const verify = (await call("GET", `/reports/verify/${printData.qrVerificationToken}`, { expectStatus: 200 })).json;
ok("QR verification confirms genuine report", verify.verified === true);
ok("QR page masks patient name", verify.patientName !== "E2E Test Patient");

// ── Sonar direct flow ──
const sonarTest = services.find((s) => s.code === "SONAR-ABD");
const inv2 = (await call("POST", "/invoices", {
  token: reception,
  body: { patientId: patient.id, items: [{ testId: sonarTest.id }] },
  expectStatus: 201,
})).json;
await call("POST", `/invoices/${inv2.id}/finalize`, { token: reception, expectStatus: 201 });
await call("POST", `/invoices/${inv2.id}/payments`, {
  token: reception, body: { amount: inv2.netTotal, idempotencyKey: `e2e-pay-2-${Date.now()}` }, expectStatus: 201,
});
const sonarQueue = (await call("GET", "/queues", { token: sonar, expectStatus: 200 })).json;
const sonarEntry = sonarQueue.find((q) => q.patient.id === patient.id);
ok("patient in sonar queue", !!sonarEntry);
const sonarReport = (await call("POST", `/reports/sonar/${sonarEntry.id}/write`, {
  token: sonar,
  body: { reportText: "Abdominal US: normal study.", submit: true },
  expectStatus: 201,
})).json;
ok("sonar report submitted directly", sonarReport.status === "SUBMITTED");

// ── Accounting summary ──
const summary = (await call("GET", "/accounting/summary", { token: accounting, expectStatus: 200 })).json;
ok("accounting sees today's income", summary.income > 0);
const balances = (await call("GET", "/accounting/report-doctor-balances", { token: accounting, expectStatus: 200 })).json;
ok("report doctor balance reflects approved price", balances.some((b) => b.unpaid >= 15000));

// Report doctor cannot read accounting
await call("GET", "/accounting/summary", { token: doctor, expectStatus: 403 });
ok("report doctor blocked from accounting", true);

// ── Merna connector disabled by default ──
const merna = await call("GET", "/merna-connector/v1/branch-kpis");
ok("merna connector disabled returns 503", merna.status === 503);

console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} E2E CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
