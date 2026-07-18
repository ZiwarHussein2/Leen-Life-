"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function DepartmentQueuePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [queues, setQueues] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = () => api<any[]>("/queues").then(setQueues).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  const nameOf = (s: any) => (locale === "ar" ? s.nameAr : locale === "ku" ? s.nameKu : s.nameEn);

  async function start(queueEntryId: string) {
    setError("");
    try {
      const scan = await api<any>(`/scans/start/${queueEntryId}`, { method: "POST" });
      router.push(`/department/scan/${scan.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.queues")}</h1>
        {error && <p className="error-text">{error}</p>}
        <table className="data">
          <thead>
            <tr><th>{t("queue.position")}</th><th>{t("queue.patient")}</th><th>{t("queue.test")}</th><th>{t("common.status")}</th><th /></tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id}>
                <td>{q.position}</td>
                <td>{q.patient.patientCode} — {q.patient.fullName}</td>
                <td>{nameOf(q.invoiceItem.test)}</td>
                <td><span className="badge">{q.status}</span></td>
                <td>
                  {q.status === "WAITING" && (
                    <button className="btn" onClick={() => start(q.id)}>{t("queue.start")}</button>
                  )}
                </td>
              </tr>
            ))}
            {queues.length === 0 && <tr><td colSpan={5} className="muted">—</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
