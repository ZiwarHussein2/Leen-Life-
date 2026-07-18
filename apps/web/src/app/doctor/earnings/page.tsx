"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function EarningsPage() {
  const { t } = useI18n();
  const [e, setE] = useState<any>(null);
  useEffect(() => {
    api<any>("/reports/my-earnings").then(setE).catch(() => {});
  }, []);
  if (!e) return <Shell><p>{t("common.loading")}</p></Shell>;
  const stats = [
    ["Pending reports", e.pendingReports],
    ["Completed reports", e.completedReports],
    ["Today", fmtIQD(e.earnedToday)],
    ["This week", fmtIQD(e.earnedThisWeek)],
    ["This month", fmtIQD(e.earnedThisMonth)],
    ["This year", fmtIQD(e.earnedThisYear)],
    ["Total earned", fmtIQD(e.totalEarned)],
    ["Cashed out", fmtIQD(e.cashedOut)],
    ["Balance", fmtIQD(e.remainingBalance)],
  ];
  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.earnings")}</h1>
        <div className="grid cols-4">
          {stats.map(([label, value]) => (
            <div className="card" key={String(label)}>
              <div className="stat-label">{label}</div>
              <div className="stat" style={{ fontSize: 20 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
