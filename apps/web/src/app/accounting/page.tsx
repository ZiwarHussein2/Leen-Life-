"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AccountingPage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<any>(null);
  const [profit, setProfit] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    api<any>("/accounting/summary").then(setSummary).catch(() => {});
    api<any>("/accounting/department-profit").then(setProfit).catch(() => {});
    api<any[]>("/accounting/report-doctor-balances").then(setBalances).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function cashout(userId: string) {
    setError("");
    try {
      await api(`/accounting/report-doctors/${userId}/cashout`, { method: "POST" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.accounting")}</h1>
        {summary && (
          <div className="grid cols-4">
            {[
              ["Income today", fmtIQD(summary.income)],
              ["Invoices", summary.invoices],
              ["Discounts", fmtIQD(summary.discountTotal)],
              ["Referral commissions", fmtIQD(summary.referralCommissions)],
              ["Report doctor cost", fmtIQD(summary.reportDoctorCost)],
              ["Inventory consumed", fmtIQD(summary.inventoryConsumedCost)],
              ["Waste cost", fmtIQD(summary.wasteCost)],
            ].map(([label, value]) => (
              <div className="card" key={String(label)}>
                <div className="stat-label">{label}</div>
                <div className="stat" style={{ fontSize: 18 }}>{String(value)}</div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="error-text">{error}</p>}

        <h2>Department profit</h2>
        <table className="data">
          <thead>
            <tr><th>Department</th><th>Tests</th><th>Income</th><th>Inventory cost</th><th>Report cost</th><th>Profit</th></tr>
          </thead>
          <tbody>
            {profit?.departments?.map((d: any) => (
              <tr key={d.department.id}>
                <td>{d.department.name}</td>
                <td>{d.tests}</td>
                <td>{fmtIQD(d.grossIncome)}</td>
                <td>{fmtIQD(d.inventoryCost)}</td>
                <td>{fmtIQD(d.reportCost)}</td>
                <td><strong>{fmtIQD(d.profit)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Report doctor balances</h2>
        <table className="data">
          <thead>
            <tr><th>Doctor</th><th>Reports</th><th>Flagged</th><th>Total</th><th>Paid</th><th>Unpaid</th><th /></tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.doctor.id}>
                <td>{b.doctor.fullName}</td>
                <td>{b.reportCount}</td>
                <td>{b.flaggedCount > 0 ? <span className="badge warn">{b.flaggedCount}</span> : "—"}</td>
                <td>{fmtIQD(b.totalEarned)}</td>
                <td>{fmtIQD(b.paid)}</td>
                <td>{fmtIQD(b.unpaid)}</td>
                <td>
                  {b.unpaid > 0 && (
                    <button className="btn secondary" onClick={() => cashout(b.doctor.id)}>Cash out</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
