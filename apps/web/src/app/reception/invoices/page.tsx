"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function InvoicesPage() {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    api<{ data: any[] }>("/invoices?pageSize=50").then((r) => setInvoices(r.data)).catch(() => {});
  }, []);
  return (
    <Shell>
      <div className="stack">
        <div className="spread">
          <h1>{t("nav.invoices")}</h1>
          <Link className="btn" href="/reception/invoices/new">{t("invoice.new")}</Link>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>{t("invoice.number")}</th><th>{t("queue.patient")}</th><th>{t("invoice.net")}</th>
              <th>{t("common.status")}</th><th>{t("invoice.paid")}</th><th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoiceNumber}</td>
                <td>{inv.patient.fullName}</td>
                <td>{fmtIQD(inv.netTotal)}</td>
                <td><span className="badge">{inv.status}</span></td>
                <td><span className={`badge ${inv.paymentStatus === "PAID" ? "success" : "warn"}`}>{inv.paymentStatus}</span></td>
                <td><Link href={`/reception/invoices/${inv.id}`}>→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
