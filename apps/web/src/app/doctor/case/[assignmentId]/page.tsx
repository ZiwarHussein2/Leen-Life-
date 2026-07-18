"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function DoctorCasePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const [detail, setDetail] = useState<any>(null);
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<any>(`/reports/my-cases/${assignmentId}`).then((d) => {
      setDetail(d);
      if (d.report) {
        setText(d.report.reportText);
        if (d.report.reportPriceEntered) setPrice(String(d.report.reportPriceEntered));
      }
    }).catch((e) => setError(e.message));
  }, [assignmentId]);
  useEffect(() => { load(); }, [load]);

  async function download(fileId: string) {
    setError("");
    try {
      const { url } = await api<{ url: string }>(`/files/${fileId}/signed-url`, { method: "POST" });
      window.open(url, "_blank");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function write(submit: boolean) {
    setError("");
    setSaved(false);
    try {
      await api(`/reports/my-cases/${assignmentId}/write`, {
        method: "POST",
        body: { reportText: text, reportPrice: price ? Number(price) : undefined, submit },
      });
      setSaved(true);
      if (submit) router.push("/doctor");
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!detail) return <Shell><p>{t("common.loading")}</p></Shell>;

  return (
    <Shell>
      <div className="stack" style={{ maxWidth: 800 }}>
        <h1>{detail.test?.nameEn}</h1>
        <p className="muted">
          {detail.patient?.patientCode} — {detail.patient?.fullName}
          {detail.patient?.yearOfBirth ? ` (${detail.patient.yearOfBirth})` : ""}
        </p>
        <div className="card stack">
          <h2>Scan files (signed, expiring links)</h2>
          {detail.files.length === 0 && <p className="muted">No files uploaded.</p>}
          {detail.files.map((f: any) => (
            <div className="row" key={f.id}>
              <span style={{ flex: 1 }}>{f.originalName} ({Math.round(Number(f.sizeBytes) / 1024)} KB)</span>
              <button className="btn secondary" onClick={() => download(f.id)}>Download</button>
            </div>
          ))}
        </div>
        <div className="card stack">
          <h2>{t("reports.editor")}</h2>
          <textarea className="input" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          <div>
            <label>{t("reports.price")} (IQD)</label>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="muted" style={{ fontSize: 12 }}>
              Prices outside your agreed rate are flagged for accounting review.
            </p>
          </div>
          {error && <p className="error-text">{error}</p>}
          {saved && <p className="muted">✓ {t("common.save")}</p>}
          <div className="row">
            <button className="btn secondary" onClick={() => write(false)}>{t("common.save")}</button>
            <button className="btn" disabled={!text || !price} onClick={() => write(true)}>{t("common.submit")}</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
