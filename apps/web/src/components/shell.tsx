"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, type Me } from "@/lib/api";
import { LOCALE_NAMES, useI18n } from "@/lib/i18n";
import type { Locale } from "@leen-life/localization";

interface NavItem {
  href: string;
  labelKey: string;
  permission?: string;
}

const NAV: Record<string, NavItem[]> = {
  RECEPTION: [
    { href: "/reception", labelKey: "nav.dashboard" },
    { href: "/reception/patients", labelKey: "nav.patients" },
    { href: "/reception/invoices", labelKey: "nav.invoices" },
    { href: "/reception/queues", labelKey: "nav.queues" },
    { href: "/reception/reports", labelKey: "nav.reports" },
  ],
  DEPARTMENT_OPERATOR: [{ href: "/department", labelKey: "nav.queues" }],
  SONAR_DOCTOR: [{ href: "/sonar", labelKey: "nav.queues" }],
  REPORT_DOCTOR: [
    { href: "/doctor", labelKey: "nav.myCases" },
    { href: "/doctor/earnings", labelKey: "nav.earnings" },
  ],
  ACCOUNTING: [{ href: "/accounting", labelKey: "nav.accounting" }],
  EMPLOYEE: [{ href: "/employee", labelKey: "nav.attendance" }],
  BRANCH_ADMIN: [
    { href: "/admin", labelKey: "nav.dashboard" },
    { href: "/admin/discounts", labelKey: "invoice.discount" },
    { href: "/admin/users", labelKey: "nav.admin" },
    { href: "/admin/hr", labelKey: "nav.employees" },
    { href: "/admin/audit", labelKey: "nav.reports" },
    { href: "/accounting", labelKey: "nav.accounting" },
    { href: "/reception", labelKey: "nav.patients" },
  ],
  PLATFORM_ADMIN: [
    { href: "/admin", labelKey: "nav.dashboard" },
    { href: "/admin/discounts", labelKey: "invoice.discount" },
    { href: "/admin/users", labelKey: "nav.admin" },
    { href: "/admin/hr", labelKey: "nav.employees" },
    { href: "/admin/audit", labelKey: "nav.reports" },
    { href: "/accounting", labelKey: "nav.accounting" },
  ],
  MERNA_GOVERNANCE: [{ href: "/accounting", labelKey: "nav.accounting" }],
};

export function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState(false);
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setError(true));
  }, []);

  if (error) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  if (!me) return <div style={{ padding: 40 }}>{t("common.loading")}</div>;

  const nav = NAV[me.role.key] ?? [];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="no-print"
        style={{
          background: "var(--canvas)",
          borderBlockEnd: "1px solid var(--hairline)",
          padding: "10px 24px",
        }}
      >
        <div className="spread">
          <div className="row">
            <strong style={{ letterSpacing: "-0.5px" }}>Leen Life</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {me.department?.name ?? me.role.name}
            </span>
          </div>
          <nav className="row">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} style={{ color: "var(--body)", fontWeight: 500 }}>
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="row">
            <select
              className="input"
              style={{ width: "auto" }}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label={t("common.language")}
            >
              {Object.entries(LOCALE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>{me.fullName}</span>
            <button
              className="btn secondary"
              onClick={() => {
                setToken(null);
                router.push("/login");
              }}
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </header>
      <main style={{ flex: 1, padding: 24, maxWidth: 1200, width: "100%", marginInline: "auto" }}>
        {children}
      </main>
    </div>
  );
}
