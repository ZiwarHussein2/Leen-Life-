"use client";
import { use, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [report, setReport] = useState<any>(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    api<any>(`/reports/${id}/print-data`).then(async (r) => {
      setReport(r);
      const url = `${window.location.origin}/verify/${r.qrVerificationToken}`;
      setQr(await QRCode.toDataURL(url, { width: 140, margin: 1 }));
    });
  }, [id]);

  if (!report) return <Shell><p>{t("common.loading")}</p></Shell>;

  return (
    <Shell>
      <div className="stack" style={{ maxWidth: 800 }}>
        <div className="row no-print">
          <button className="btn" onClick={async () => {
            await api(`/reports/${report.id}/mark-printed`, { method: "POST" }).catch(() => {});
            window.print();
          }}>
            {t("common.print")}
          </button>
        </div>
        <div className="card" style={{ padding: 40 }}>
          <div className="spread">
            <div>
              <h1>Leen Life Medical Complex</h1>
              <p className="muted">Erbil, Kurdistan Region, Iraq</p>
            </div>
            {qr && (
              <div style={{ textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Verification QR" width={110} height={110} />
                <p className="muted" style={{ fontSize: 10 }}>Scan to verify</p>
              </div>
            )}
          </div>
          <hr style={{ border: "none", borderBlockStart: "1px solid var(--hairline)", marginBlock: 16 }} />
          <table style={{ marginBlockEnd: 16 }}>
            <tbody>
              <tr><td className="muted" style={{ paddingInlineEnd: 16 }}>{t("queue.patient")}</td>
                <td><strong>{report.patient.patientCode} — {report.patient.fullName}</strong>
                  {report.patient.yearOfBirth ? ` (${report.patient.yearOfBirth})` : ""}</td></tr>
              <tr><td className="muted">{t("queue.test")}</td><td>{report.invoiceItem.test.nameEn}</td></tr>
              <tr><td className="muted">{t("nav.reports")}</td><td>{report.department.name}</td></tr>
              <tr><td className="muted">Doctor</td><td>{report.reportDoctor.fullName}</td></tr>
              <tr><td className="muted">{t("common.date")}</td>
                <td>{report.submittedAt ? new Date(report.submittedAt).toLocaleString() : "—"}</td></tr>
            </tbody>
          </table>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, minHeight: 200 }}>{report.reportText}</div>
          <hr style={{ border: "none", borderBlockStart: "1px solid var(--hairline)", marginBlock: 16 }} />
          <p className="muted" style={{ fontSize: 11 }}>
            Report ID {report.id} — verify authenticity at /verify/{report.qrVerificationToken.slice(0, 8)}…
          </p>
        </div>
      </div>
    </Shell>
  );
}
