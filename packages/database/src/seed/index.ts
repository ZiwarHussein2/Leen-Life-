/**
 * Deterministic synthetic seed data for local/staging (spec §33.9).
 * All people, phone numbers, and amounts are fictional. Never add real
 * patient, employee, doctor, shareholder, or financial data.
 *
 * Run with: pnpm --filter @leen-life/database seed
 */
import { PrismaClient, DepartmentType, ReferralDealType } from "@prisma/client";

// Relative source import keeps the seed runnable with tsx before any
// package build step has produced dist output.
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, MFA_REQUIRED_ROLES } from "../../../permissions/src/index.js";

const prisma = new PrismaClient();

/** Deterministic PRNG (mulberry32) so every seed run is identical. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260718);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const FIRST_NAMES = [
  "Aram", "Bawan", "Chnar", "Dilan", "Evin", "Farhad", "Gulan", "Hemin", "Jwan", "Karwan",
  "Lana", "Media", "Nechirvan", "Ozlem", "Peshawa", "Rezan", "Shvan", "Tara", "Yad", "Zilan",
  "Ahmed", "Banaz", "Dara", "Hana", "Kamaran", "Lava", "Muhammed", "Narin", "Rawa", "Shilan",
];
const LAST_NAMES = [
  "Ahmadi", "Barzani", "Dizayee", "Hariri", "Jaff", "Karim", "Mahmoud", "Mufti", "Omar",
  "Qadir", "Rashid", "Salih", "Talabani", "Yousif", "Zebari", "Hassan", "Ibrahim", "Najat",
];
const ADDRESSES = [
  "Ankawa, Erbil", "100m Road, Erbil", "Dream City, Erbil", "Iskan, Erbil",
  "Bakhtiari, Erbil", "Shorsh, Erbil", "Havalan, Erbil", "Kasnazan, Erbil",
];

async function main() {
  console.log("Seeding Leen Life synthetic data...");

  // ── Branch ──
  const branch = await prisma.branch.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Leen Life Medical Complex",
      city: "Erbil",
      address: "Erbil, Kurdistan Region, Iraq",
    },
  });

  // ── Departments ──
  const deptTypes: { type: DepartmentType; name: string; subdomain: string | null }[] = [
    { type: "SONAR", name: "Sonar Department", subdomain: "sonar" },
    { type: "MRI", name: "MRI Department", subdomain: "mri" },
    { type: "CT", name: "CT Scan Department", subdomain: "ct" },
    { type: "XRAY", name: "X-Ray Department", subdomain: "xray" },
    { type: "MAMMOGRAPHY", name: "Mammography Department", subdomain: "mammography" },
    { type: "DEXA", name: "DEXA Scan Department", subdomain: "dexa" },
    { type: "RECEPTION", name: "Reception", subdomain: "reception" },
    { type: "ADMINISTRATION", name: "Administration", subdomain: "admin" },
    { type: "ACCOUNTING", name: "Accounting", subdomain: "accounting" },
  ];
  const departments: Record<string, { id: string }> = {};
  for (const d of deptTypes) {
    departments[d.type] = await prisma.department.upsert({
      where: { branchId_type: { branchId: branch.id, type: d.type } },
      update: {},
      create: { branchId: branch.id, ...d },
    });
  }

  // ── Permissions and roles (from @leen-life/permissions matrix) ──
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  const roleIds: Record<string, string> = {};
  for (const [key, name] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name },
      create: { key, name },
    });
    roleIds[key] = role.id;
    const perms = ROLE_PERMISSIONS[key as keyof typeof ROLE_PERMISSIONS] ?? [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const pKey of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: pKey } });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  // ── Users (synthetic demo accounts) ──
  type SeedUser = {
    email: string; fullName: string; roleKey: keyof typeof ROLES;
    departmentType?: DepartmentType; language?: string;
  };
  const seedUsers: SeedUser[] = [
    { email: "platform@gashtysoft.test", fullName: "GashtySoft Platform Admin", roleKey: "PLATFORM_ADMIN" },
    { email: "admin@leenlife.test", fullName: "Leen Life Administrator", roleKey: "BRANCH_ADMIN" },
    { email: "accounting@leenlife.test", fullName: "Accounting Officer", roleKey: "ACCOUNTING" },
    { email: "reception1@leenlife.test", fullName: "Reception Desk One", roleKey: "RECEPTION", departmentType: "RECEPTION" },
    { email: "reception2@leenlife.test", fullName: "Reception Desk Two", roleKey: "RECEPTION", departmentType: "RECEPTION" },
    { email: "mri@leenlife.test", fullName: "MRI Operator", roleKey: "DEPARTMENT_OPERATOR", departmentType: "MRI" },
    { email: "ct@leenlife.test", fullName: "CT Operator", roleKey: "DEPARTMENT_OPERATOR", departmentType: "CT" },
    { email: "xray@leenlife.test", fullName: "X-Ray Operator", roleKey: "DEPARTMENT_OPERATOR", departmentType: "XRAY" },
    { email: "mammography@leenlife.test", fullName: "Mammography Operator", roleKey: "DEPARTMENT_OPERATOR", departmentType: "MAMMOGRAPHY" },
    { email: "dexa@leenlife.test", fullName: "DEXA Operator", roleKey: "DEPARTMENT_OPERATOR", departmentType: "DEXA" },
    { email: "sonar@leenlife.test", fullName: "Dr. Sonar Specialist", roleKey: "SONAR_DOCTOR", departmentType: "SONAR" },
    { email: "reportdoc1@leenlife.test", fullName: "Dr. Report Writer One", roleKey: "REPORT_DOCTOR" },
    { email: "reportdoc2@leenlife.test", fullName: "Dr. Report Writer Two", roleKey: "REPORT_DOCTOR" },
    { email: "employee1@leenlife.test", fullName: "New Employee One", roleKey: "EMPLOYEE" },
    { email: "employee2@leenlife.test", fullName: "New Employee Two", roleKey: "EMPLOYEE" },
    { email: "merna@merna.test", fullName: "Merna Governance Viewer", roleKey: "MERNA_GOVERNANCE" },
  ];
  const users: Record<string, { id: string }> = {};
  for (const u of seedUsers) {
    users[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        roleId: roleIds[u.roleKey],
        branchId: branch.id,
        departmentId: u.departmentType ? departments[u.departmentType].id : null,
        status: "ACTIVE",
        mfaRequired: MFA_REQUIRED_ROLES.includes(u.roleKey as any),
        language: u.language ?? "en",
      },
    });
  }

  // Report doctor profiles (agreed price per report + tolerance band)
  await prisma.reportDoctorProfile.upsert({
    where: { userId: users["reportdoc1@leenlife.test"].id },
    update: {},
    create: { userId: users["reportdoc1@leenlife.test"].id, agreedPrice: 15000, priceTolerance: 5000, specialty: "MRI/CT" },
  });
  await prisma.reportDoctorProfile.upsert({
    where: { userId: users["reportdoc2@leenlife.test"].id },
    update: {},
    create: { userId: users["reportdoc2@leenlife.test"].id, agreedPrice: 10000, priceTolerance: 2500, specialty: "X-Ray/Mammography/DEXA" },
  });

  // ── Tests / services with trilingual names ──
  const adminUser = users["admin@leenlife.test"];
  type SeedTest = {
    code: string; dept: DepartmentType; en: string; ar: string; ku: string;
    price: number; report: boolean; minutes: number;
  };
  const seedTests: SeedTest[] = [
    { code: "MRI-BRAIN", dept: "MRI", en: "MRI Brain", ar: "رنين مغناطيسي للدماغ", ku: "ئێم ئاڕ ئای مێشک", price: 150000, report: true, minutes: 30 },
    { code: "MRI-SPINE", dept: "MRI", en: "MRI Lumbar Spine", ar: "رنين مغناطيسي للعمود الفقري", ku: "ئێم ئاڕ ئای بڕبڕەی پشت", price: 160000, report: true, minutes: 35 },
    { code: "MRI-KNEE", dept: "MRI", en: "MRI Knee", ar: "رنين مغناطيسي للركبة", ku: "ئێم ئاڕ ئای ئەژنۆ", price: 140000, report: true, minutes: 30 },
    { code: "CT-BRAIN", dept: "CT", en: "CT Brain", ar: "مفراس الدماغ", ku: "سیتی سکان مێشک", price: 90000, report: true, minutes: 15 },
    { code: "CT-CHEST", dept: "CT", en: "CT Chest", ar: "مفراس الصدر", ku: "سیتی سکان سنگ", price: 100000, report: true, minutes: 15 },
    { code: "CT-ABDOMEN", dept: "CT", en: "CT Abdomen", ar: "مفراس البطن", ku: "سیتی سکان سک", price: 110000, report: true, minutes: 20 },
    { code: "XRAY-CHEST", dept: "XRAY", en: "X-Ray Chest", ar: "أشعة الصدر", ku: "تیشکی سنگ", price: 15000, report: false, minutes: 10 },
    { code: "XRAY-LIMB", dept: "XRAY", en: "X-Ray Limb", ar: "أشعة الأطراف", ku: "تیشکی ئەندام", price: 12000, report: false, minutes: 10 },
    { code: "MAMMO-SCREEN", dept: "MAMMOGRAPHY", en: "Screening Mammography", ar: "تصوير الثدي الشعاعي", ku: "مامۆگرافی پشکنین", price: 50000, report: true, minutes: 20 },
    { code: "DEXA-FULL", dept: "DEXA", en: "DEXA Bone Density", ar: "قياس كثافة العظام", ku: "دێکسا چڕی ئێسک", price: 45000, report: true, minutes: 20 },
    { code: "SONAR-ABD", dept: "SONAR", en: "Abdominal Ultrasound", ar: "سونار البطن", ku: "سۆناری سک", price: 25000, report: true, minutes: 15 },
    { code: "SONAR-OBS", dept: "SONAR", en: "Obstetric Ultrasound", ar: "سونار الحمل", ku: "سۆناری دووگیانی", price: 30000, report: true, minutes: 15 },
  ];
  const tests: Record<string, { id: string; departmentId: string; basePrice: number; requiresReportDefault: boolean }> = {};
  for (const t of seedTests) {
    tests[t.code] = await prisma.test.upsert({
      where: { code: t.code },
      update: {},
      create: {
        code: t.code,
        departmentId: departments[t.dept].id,
        nameEn: t.en,
        nameAr: t.ar,
        nameKu: t.ku,
        basePrice: t.price,
        requiresReportDefault: t.report,
        estimatedMinutes: t.minutes,
      },
    });
  }

  // Time-based pricing for MRI and CT (morning vs afternoon)
  const timeRules: { test: string; start: string; end: string; price: number }[] = [
    { test: "MRI-BRAIN", start: "08:00", end: "14:00", price: 140000 },
    { test: "MRI-BRAIN", start: "14:00", end: "21:30", price: 160000 },
    { test: "MRI-SPINE", start: "08:00", end: "14:00", price: 150000 },
    { test: "MRI-SPINE", start: "14:00", end: "21:30", price: 170000 },
    { test: "CT-BRAIN", start: "08:00", end: "14:00", price: 85000 },
    { test: "CT-BRAIN", start: "14:00", end: "21:30", price: 95000 },
    { test: "CT-CHEST", start: "08:00", end: "14:00", price: 95000 },
    { test: "CT-CHEST", start: "14:00", end: "21:30", price: 105000 },
  ];
  for (const r of timeRules) {
    const t = tests[r.test];
    const existing = await prisma.timePriceRule.findFirst({
      where: { testId: t.id, startTime: r.start, endTime: r.end },
    });
    if (!existing) {
      await prisma.timePriceRule.create({
        data: {
          testId: t.id,
          departmentId: t.departmentId,
          startTime: r.start,
          endTime: r.end,
          price: r.price,
          createdById: adminUser.id,
        },
      });
    }
  }

  // ── Inventory items, department stock, and test recipes ──
  const invItems: { key: string; en: string; ar: string; ku: string; unit: string; cost: number }[] = [
    { key: "FILM", en: "Radiology Film", ar: "فيلم أشعة", ku: "فیلمی تیشک", unit: "film", cost: 3000 },
    { key: "PAPER", en: "Printing Paper", ar: "ورق طباعة", ku: "کاغەزی چاپ", unit: "sheet", cost: 100 },
    { key: "DVD", en: "DVD Disc", ar: "قرص دي في دي", ku: "دیسکی DVD", unit: "disc", cost: 1000 },
    { key: "ENVELOPE", en: "Result Envelope", ar: "ظرف النتائج", ku: "زەرفی ئەنجام", unit: "envelope", cost: 500 },
    { key: "REPORT-PAPER", en: "Branded Report Paper", ar: "ورق تقارير رسمي", ku: "کاغەزی ڕاپۆرتی فەرمی", unit: "sheet", cost: 300 },
  ];
  const inventory: Record<string, { id: string; cost: number }> = {};
  for (const i of invItems) {
    const existing = await prisma.inventoryItem.findFirst({ where: { nameEn: i.en } });
    const item = existing ?? (await prisma.inventoryItem.create({
      data: { nameEn: i.en, nameAr: i.ar, nameKu: i.ku, unit: i.unit, costPerUnit: i.cost },
    }));
    inventory[i.key] = { id: item.id, cost: i.cost };
  }
  // Stock every radiology department with every item
  for (const deptType of ["SONAR", "MRI", "CT", "XRAY", "MAMMOGRAPHY", "DEXA"] as DepartmentType[]) {
    for (const key of Object.keys(inventory)) {
      await prisma.departmentInventory.upsert({
        where: {
          departmentId_inventoryItemId: {
            departmentId: departments[deptType].id,
            inventoryItemId: inventory[key].id,
          },
        },
        update: {},
        create: {
          branchId: branch.id,
          departmentId: departments[deptType].id,
          inventoryItemId: inventory[key].id,
          currentQuantity: 500,
          lowStockThreshold: 50,
        },
      });
    }
  }
  // Recipes: expected asset consumption per test (restaurant-recipe model)
  const recipes: { test: string; item: string; qty: number }[] = [
    { test: "MRI-BRAIN", item: "FILM", qty: 2 }, { test: "MRI-BRAIN", item: "PAPER", qty: 4 },
    { test: "MRI-BRAIN", item: "DVD", qty: 1 }, { test: "MRI-BRAIN", item: "ENVELOPE", qty: 1 },
    { test: "MRI-SPINE", item: "FILM", qty: 2 }, { test: "MRI-SPINE", item: "DVD", qty: 1 },
    { test: "CT-BRAIN", item: "FILM", qty: 1 }, { test: "CT-BRAIN", item: "DVD", qty: 1 },
    { test: "CT-CHEST", item: "FILM", qty: 2 }, { test: "CT-CHEST", item: "DVD", qty: 1 },
    { test: "XRAY-CHEST", item: "FILM", qty: 1 }, { test: "XRAY-CHEST", item: "ENVELOPE", qty: 1 },
    { test: "MAMMO-SCREEN", item: "FILM", qty: 2 }, { test: "MAMMO-SCREEN", item: "ENVELOPE", qty: 1 },
    { test: "DEXA-FULL", item: "PAPER", qty: 2 }, { test: "DEXA-FULL", item: "ENVELOPE", qty: 1 },
    { test: "SONAR-ABD", item: "REPORT-PAPER", qty: 1 }, { test: "SONAR-OBS", item: "REPORT-PAPER", qty: 1 },
  ];
  for (const r of recipes) {
    await prisma.testAssetRecipe.upsert({
      where: { testId_inventoryItemId: { testId: tests[r.test].id, inventoryItemId: inventory[r.item].id } },
      update: { expectedQuantity: r.qty },
      create: { testId: tests[r.test].id, inventoryItemId: inventory[r.item].id, expectedQuantity: r.qty },
    });
  }

  // ── Referral partners with every deal type ──
  const partnersSeed: { name: string; deal: ReferralDealType; amount?: number; pct?: number; asDiscount?: boolean }[] = [
    { name: "Dr. Ziwar (Neurology Clinic)", deal: "FIXED_PER_PATIENT", amount: 10000 },
    { name: "Dr. Mohammed (Orthopedics)", deal: "DISCOUNT_TO_PATIENT", amount: 10000, asDiscount: true },
    { name: "Dr. Sara (Internal Medicine)", deal: "NO_COMMISSION" },
    { name: "City Medical Clinic", deal: "PERCENTAGE", pct: 5 },
  ];
  for (const p of partnersSeed) {
    let partner = await prisma.referralPartner.findFirst({ where: { name: p.name } });
    if (!partner) {
      partner = await prisma.referralPartner.create({
        data: { name: p.name, type: p.name.includes("Clinic") && !p.name.startsWith("Dr.") ? "CLINIC" : "DOCTOR" },
      });
      await prisma.referralDeal.create({
        data: {
          referralPartnerId: partner.id,
          dealType: p.deal,
          amount: p.amount ?? null,
          percentage: p.pct ?? null,
          appliesAsDiscount: p.asDiscount ?? false,
          createdById: adminUser.id,
        },
      });
    }
  }

  // ── Discount codes ──
  const year = new Date("2026-01-01T00:00:00Z");
  const yearEnd = new Date("2026-12-31T23:59:59Z");
  for (const dc of [
    { code: "WELCOME10", type: "PERCENTAGE" as const, value: 10, limit: 100 },
    { code: "STAFF5000", type: "FIXED" as const, value: 5000, limit: 500 },
  ]) {
    await prisma.discountCode.upsert({
      where: { code: dc.code },
      update: {},
      create: {
        code: dc.code, type: dc.type, value: dc.value,
        startDate: year, endDate: yearEnd, usageLimit: dc.limit,
        createdById: adminUser.id,
      },
    });
  }

  // ── Work policies (trilingual) ──
  for (const wp of [
    { lang: "en", title: "General Work Policy", content: "Working hours are 08:00-16:00, Sunday to Thursday. Attendance is recorded by geofenced check-in. Late arrival beyond 15 minutes is deducted per HR rules. All staff must protect patient privacy and report security incidents immediately." },
    { lang: "ar", title: "سياسة العمل العامة", content: "ساعات العمل من 8:00 إلى 16:00، من الأحد إلى الخميس. يُسجَّل الحضور عبر تسجيل الدخول الجغرافي. يُخصم التأخير الذي يتجاوز 15 دقيقة وفق قواعد الموارد البشرية. على جميع الموظفين حماية خصوصية المرضى والإبلاغ الفوري عن الحوادث الأمنية." },
    { lang: "ku", title: "سیاسەتی گشتی کار", content: "کاتژمێرەکانی کار لە 8:00 بۆ 16:00، لە یەکشەممە بۆ پێنجشەممە. ئامادەبوون بە چوونەژوورەوەی جیۆفێنس تۆمار دەکرێت. دواکەوتنی زیاتر لە 15 خولەک بەپێی یاساکانی HR دەبڕدرێت. هەموو ستافەکان دەبێت پاراستنی نهێنی نەخۆشەکان بکەن." },
  ]) {
    await prisma.workPolicy.upsert({
      where: { branchId_title_language_version: { branchId: branch.id, title: wp.title, language: wp.lang, version: 1 } },
      update: {},
      create: { branchId: branch.id, title: wp.title, language: wp.lang, content: wp.content, version: 1, createdBy: adminUser.id },
    });
  }

  // ── Synthetic patients and historical visits ──
  const patientCount = await prisma.patient.count();
  if (patientCount < 500) {
    console.log("Generating 500 synthetic patients with ~1000 visits...");
    const receptionUser = users["reception1@leenlife.test"];
    const testList = Object.entries(tests);
    for (let i = 1; i <= 500; i++) {
      const code = `LL-${String(i).padStart(6, "0")}`;
      const fullName = `${pick(FIRST_NAMES)} ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const patient = await prisma.patient.upsert({
        where: { patientCode: code },
        update: {},
        create: {
          patientCode: code,
          fullName,
          yearOfBirth: randInt(1945, 2010),
          phone: `0750${randInt(1000000, 9999999)}`,
          address: pick(ADDRESSES),
        },
      });
      // 1–3 historical visits per patient (~1000 total)
      const visitCount = randInt(1, 3);
      for (let v = 0; v < visitCount; v++) {
        const daysAgo = randInt(1, 180);
        const visitDate = new Date(Date.now() - daysAgo * 86400000);
        const invoiceNumber = `INV-S${String(i).padStart(4, "0")}-${v}`;
        const exists = await prisma.invoice.findUnique({ where: { invoiceNumber } });
        if (exists) continue;
        const [testCode, t] = pick(testList);
        const qty = 1;
        const price = t.basePrice;
        await prisma.invoice.create({
          data: {
            invoiceNumber,
            patientId: patient.id,
            branchId: branch.id,
            subtotal: price * qty,
            discountTotal: 0,
            netTotal: price * qty,
            paymentStatus: "PAID",
            status: "FINALIZED",
            createdById: receptionUser.id,
            createdAt: visitDate,
            items: {
              create: [{
                testId: t.id,
                departmentId: t.departmentId,
                quantity: qty,
                basePrice: price,
                finalPrice: price,
                requiresReport: t.requiresReportDefault,
                status: "COMPLETED",
                createdAt: visitDate,
              }],
            },
            payments: {
              create: [{
                amount: price * qty,
                method: "CASH",
                receivedById: receptionUser.id,
                paidAt: visitDate,
              }],
            },
          },
        });
      }
      if (i % 100 === 0) console.log(`  ${i}/500 patients`);
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
