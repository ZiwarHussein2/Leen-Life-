"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Sonar portal: queue + direct report editor (spec §15). */
export default function SonarPage() {
  const { t, locale } = useI18n();
  const [queues, setQueues] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => api<any[]>("/queues").then(setQueues).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const nameOf = (s: any) => (locale === "ar" ? s.nameAr : locale === "ku" ? s.nameKu : s.nameEn);

  async function write(submit: boolean) {
    setError("");
    setSaved(false);
    try {
      await api(`/reports/sonar/${active.id}/write`, {
        method: "POST",
        body: { reportText: text, submit },
      });
      setSaved(true);
      if (submit) {
        setActive(null);
        setText("");
        load();
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="grid cols-2">
        <div className="stack">
          <h1>{t("nav.queues")}</h1>
          <table className="data">
            <thead><tr><th>{t("queue.position")}</th><th>{t("queue.patient")}</th><th>{t("queue.test")}</th><th /></tr></thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id}>
                  <td>{q.position}</td>
                  <td>{q.patient.patientCode} — {q.patient.fullName}</td>
                  <td>{nameOf(q.invoiceItem.test)}</td>
                  <td>
                    {(q.status === "WAITING" || q.status === "IN_PROGRESS") && (
                      <button className="btn secondary" onClick={() => { setActive(q); setText(""); }}>
                        {t("reports.editor")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {queues.length === 0 && <tr><td colSpan={4} className="muted">—</td></tr>}
            </tbody>
          </table>
        </div>
        {active && (
          <div className="card stack">
            <h2>{active.patient.fullName} — {nameOf(active.invoiceItem.test)}</h2>
            <textarea className="input" rows={14} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t("reports.editor")} />
            {error && <p className="error-text">{error}</p>}
            {saved && <p className="muted">✓ {t("common.save")}</p>}
            <div className="row">
              <button className="btn secondary" onClick={() => write(false)}>{t("common.save")}</button>
              <button className="btn" disabled={!text} onClick={() => write(true)}>{t("common.submit")}</button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
