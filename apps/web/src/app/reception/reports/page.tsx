"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ReportsPage() {
  const { t } = useI18n();
  const [waiting, setWaiting] = useState<any[]>([]);
  const [completed, setCompleted] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    api<any[]>("/reports/waiting").then(setWaiting).catch(() => {});
    api<any[]>("/reports/completed").then(setCompleted).catch(() => {});
    api<any[]>("/reports/doctors").then(setDoctors).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function assign(invoiceItemId: string, doctorUserId: string) {
    setError("");
    try {
      await api(`/reports/cases/${invoiceItemId}/assign`, { method: "POST", body: { doctorUserId } });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("reports.waiting")}</h1>
        {error && <p className="error-text">{error}</p>}
        <table className="data">
          <thead>
            <tr><th>{t("queue.patient")}</th><th>{t("queue.test")}</th><th>Files</th><th>{t("reports.assign")}</th></tr>
          </thead>
          <tbody>
            {waiting.map((w) => {
              const hasAssignment = w.reportAssignments?.length > 0;
              return (
                <tr key={w.id}>
                  <td>{w.invoice.patient.patientCode} — {w.invoice.patient.fullName}</td>
                  <td>{w.test.nameEn}</td>
                  <td>{w.scanOperations?.flatMap((s: any) => s.files).length ?? 0}</td>
                  <td>
                    {hasAssignment ? (
                      <span className="badge ok">Assigned</span>
                    ) : (
                      <select className="input" defaultValue="" onChange={(e) => e.target.value && assign(w.id, e.target.value)}>
                        <option value="">{t("reports.assign")}…</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>{d.fullName}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
            {waiting.length === 0 && <tr><td colSpan={4} className="muted">—</td></tr>}
          </tbody>
        </table>

        <h1>{t("reports.completed")}</h1>
        <table className="data">
          <thead>
            <tr><th>{t("queue.patient")}</th><th>{t("queue.test")}</th><th>Doctor</th><th>{t("common.status")}</th><th /></tr>
          </thead>
          <tbody>
            {completed.map((r) => (
              <tr key={r.id}>
                <td>{r.patient.patientCode} — {r.patient.fullName}</td>
                <td>{r.invoiceItem.test.nameEn}</td>
                <td>{r.reportDoctor.fullName}</td>
                <td><span className={`badge ${r.status === "PRINTED" ? "success" : "ok"}`}>{r.status}</span></td>
                <td><Link href={`/reception/reports/print/${r.id}`}>{t("common.print")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
