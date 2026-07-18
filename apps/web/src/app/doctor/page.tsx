"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function DoctorCasesPage() {
  const { t } = useI18n();
  const [cases, setCases] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/reports/my-cases").then(setCases).catch(() => {});
  }, []);
  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.myCases")}</h1>
        <table className="data">
          <thead>
            <tr><th>{t("queue.test")}</th><th>{t("nav.reports")}</th><th>{t("common.status")}</th><th>Files</th><th /></tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>{c.invoiceItem.test.nameEn}</td>
                <td>{c.department.name}</td>
                <td><span className="badge">{c.status}</span></td>
                <td>{c.invoiceItem.scanOperations?.flatMap((s: any) => s.files).length ?? 0}</td>
                <td><Link href={`/doctor/case/${c.id}`}>{t("reports.editor")} →</Link></td>
              </tr>
            ))}
            {cases.length === 0 && <tr><td colSpan={5} className="muted">—</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
