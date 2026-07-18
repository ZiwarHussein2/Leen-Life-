"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function QueuesOverviewPage() {
  const { t } = useI18n();
  const [queues, setQueues] = useState<any[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const load = () => api<any[]>("/queues").then(setQueues).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  async function move(id: string, newPosition: number) {
    if (!reason) {
      setError("A reason is required for queue reordering");
      return;
    }
    setError("");
    try {
      await api(`/queues/${id}/reorder`, { method: "POST", body: { newPosition, reason } });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const byDept = new Map<string, any[]>();
  for (const q of queues) {
    byDept.set(q.department.name, [...(byDept.get(q.department.name) ?? []), q]);
  }

  return (
    <Shell>
      <div className="stack">
        <div className="spread">
          <h1>{t("nav.queues")}</h1>
          <input className="input" style={{ width: 280 }} placeholder="Reorder reason (required)"
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="grid cols-2">
          {[...byDept.entries()].map(([dept, entries]) => (
            <div className="card" key={dept}>
              <h2>{dept}</h2>
              <table className="data" style={{ marginBlockStart: 8 }}>
                <thead>
                  <tr><th>{t("queue.position")}</th><th>{t("queue.patient")}</th><th>{t("queue.test")}</th><th>{t("common.status")}</th><th /></tr>
                </thead>
                <tbody>
                  {entries.map((q) => (
                    <tr key={q.id}>
                      <td>{q.position}</td>
                      <td>{q.patient.patientCode} — {q.patient.fullName}</td>
                      <td>{q.invoiceItem.test.nameEn}</td>
                      <td><span className="badge">{q.status}</span></td>
                      <td className="row">
                        {q.status === "WAITING" && (
                          <>
                            <button className="btn secondary" onClick={() => move(q.id, Math.max(1, q.position - 1))}>↑</button>
                            <button className="btn secondary" onClick={() => move(q.id, q.position + 1)}>↓</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
