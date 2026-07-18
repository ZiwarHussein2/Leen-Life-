"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function DiscountApprovalsPage() {
  const { t } = useI18n();
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = () =>
    api<{ data: any[] }>("/discounts/requests?status=PENDING").then((r) => setRequests(r.data)).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setError("");
    try {
      await api(`/discounts/requests/${id}/decision`, {
        method: "POST",
        body: { decision, ...(decision === "REJECTED" ? { rejectionReason: "Rejected by admin" } : {}) },
      });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("invoice.discount")}</h1>
        {error && <p className="error-text">{error}</p>}
        <table className="data">
          <thead>
            <tr>
              <th>{t("invoice.number")}</th><th>{t("queue.patient")}</th><th>{t("invoice.net")}</th>
              <th>Requested</th><th>Reason</th><th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.invoice.invoiceNumber}</td>
                <td>{r.invoice.patient.fullName}</td>
                <td>{fmtIQD(r.invoice.netTotal)}</td>
                <td>{r.requestedAmount ? fmtIQD(r.requestedAmount) : `${r.requestedPercentage}%`}</td>
                <td>{r.reason}</td>
                <td className="row">
                  <button className="btn" onClick={() => decide(r.id, "APPROVED")}>{t("common.approve")}</button>
                  <button className="btn danger" onClick={() => decide(r.id, "REJECTED")}>{t("common.reject")}</button>
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={6} className="muted">—</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
