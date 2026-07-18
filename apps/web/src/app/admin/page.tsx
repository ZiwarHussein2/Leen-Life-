"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AdminDashboard() {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api<any>("/admin/dashboard").then(setD).catch(() => {});
  }, []);
  if (!d) return <Shell><p>{t("common.loading")}</p></Shell>;
  const stats = [
    ["Patients today", d.patientsToday],
    ["Tests completed", d.testsCompletedToday],
    ["Reports pending", d.reportsPending],
    ["Reports completed", d.reportsCompletedToday],
    ["Discounts pending", d.discountsPendingApproval],
    ["Low stock items", d.lowStockCount],
    ["Attendance issues", d.attendanceIssuesToday],
    ["Security alerts", d.openSecurityAlerts],
  ];
  return (
    <Shell>
      <div className="stack">
        <div className="spread">
          <h1>{t("nav.dashboard")}</h1>
          <div className="card" style={{ padding: "10px 20px" }}>
            <span className="stat-label">Revenue today</span>{" "}
            <span className="stat" style={{ fontSize: 20 }}>{fmtIQD(d.revenueToday)}</span>
          </div>
        </div>
        <div className="grid cols-4">
          {stats.map(([label, value]) => (
            <div className="card" key={String(label)}>
              <div className="stat-label">{label}</div>
              <div className="stat">{String(value)}</div>
            </div>
          ))}
        </div>
        <h2>{t("nav.queues")}</h2>
        <table className="data">
          <thead>
            <tr><th>{t("nav.reports")}</th><th>{t("queue.waiting")}</th><th>{t("queue.inProgress")}</th><th>{t("queue.done")}</th></tr>
          </thead>
          <tbody>
            {d.queueStatus.map((q: any) => (
              <tr key={q.department.id}>
                <td>{q.department.name}</td>
                <td>{q.waiting}</td>
                <td>{q.inProgress}</td>
                <td>{q.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
