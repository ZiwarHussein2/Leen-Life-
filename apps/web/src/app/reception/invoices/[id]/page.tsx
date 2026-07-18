"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [inv, setInv] = useState<any>(null);
  const [error, setError] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [code, setCode] = useState("");

  const load = useCallback(() => {
    api<any>(`/invoices/${id}`).then(setInv).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!inv) return <Shell><p>{t("common.loading")}</p></Shell>;
  const paid = inv.payments.reduce((s: number, p: any) => s + p.amount, 0);
  const due = inv.netTotal - paid;
  const pendingDiscount = inv.discountRequests?.some((d: any) => d.status === "PENDING");

  return (
    <Shell>
      <div className="stack" style={{ maxWidth: 800 }}>
        <div className="spread">
          <h1>{inv.invoiceNumber}</h1>
          <div className="row">
            <span className="badge">{inv.status}</span>
            <span className={`badge ${inv.paymentStatus === "PAID" ? "success" : "warn"}`}>{inv.paymentStatus}</span>
            <button className="btn secondary no-print" onClick={() => window.print()}>{t("common.print")}</button>
          </div>
        </div>

        <div className="card">
          <h2>{t("receipt.title")}</h2>
          <p className="muted">{t("app.branch")}</p>
          <p>
            <strong>{inv.patient.patientCode}</strong> — {inv.patient.fullName}
            {inv.patient.yearOfBirth ? ` (${inv.patient.yearOfBirth})` : ""}
          </p>
          <table className="data" style={{ marginBlock: 12 }}>
            <thead>
              <tr><th>{t("queue.test")}</th><th>{t("common.total")}</th></tr>
            </thead>
            <tbody>
              {inv.items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.test.nameEn} <span className="badge">{item.status}</span></td>
                  <td>{fmtIQD(item.finalPrice * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="spread"><span>{t("invoice.subtotal")}</span><strong>{fmtIQD(inv.subtotal)}</strong></div>
          <div className="spread"><span>{t("invoice.discount")}</span><strong>-{fmtIQD(inv.discountTotal)}</strong></div>
          <div className="spread" style={{ fontSize: 18 }}><span>{t("invoice.net")}</span><strong>{fmtIQD(inv.netTotal)}</strong></div>
          <div className="spread"><span>{t("invoice.paid")}</span><strong>{fmtIQD(paid)}</strong></div>
          <p className="muted" style={{ marginBlockStart: 8 }}>{t("receipt.thanks")}</p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="grid cols-2 no-print">
          {inv.status !== "FINALIZED" && inv.status !== "CANCELLED" && (
            <>
              <div className="card stack">
                <h2>{t("invoice.requestDiscount")}</h2>
                {pendingDiscount ? (
                  <span className="badge warn">Pending approval</span>
                ) : (
                  <>
                    <div><label>{t("invoice.discountReason")}</label>
                      <input className="input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></div>
                    <div><label>{t("invoice.discount")} (IQD)</label>
                      <input className="input" type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /></div>
                    <button className="btn secondary" disabled={!discountReason || !discountAmount}
                      onClick={() => act(() => api("/discounts/requests", {
                        method: "POST",
                        body: { invoiceId: inv.id, reason: discountReason, requestedAmount: Number(discountAmount) },
                      }))}>
                      {t("common.submit")}
                    </button>
                    <div className="row">
                      <input className="input" style={{ flex: 1 }} placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} />
                      <button className="btn secondary" disabled={!code}
                        onClick={() => act(() => api(`/invoices/${inv.id}/apply-code`, { method: "POST", body: { code } }))}>
                        {t("common.submit")}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="card stack">
                <h2>{t("invoice.finalize")}</h2>
                <p className="muted">Finalize freezes the invoice; payment then moves patients into department queues.</p>
                <button className="btn" disabled={pendingDiscount}
                  onClick={() => act(() => api(`/invoices/${inv.id}/finalize`, { method: "POST" }))}>
                  {t("invoice.finalize")}
                </button>
              </div>
            </>
          )}
          {inv.status === "FINALIZED" && due > 0 && (
            <div className="card stack">
              <h2>{t("invoice.pay")}</h2>
              <div><label>{t("common.total")} ({fmtIQD(due)} due)</label>
                <input className="input" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <button className="btn"
                onClick={() => act(() => api(`/invoices/${inv.id}/payments`, {
                  method: "POST",
                  body: { amount: Number(payAmount), idempotencyKey: `${inv.id}-${payAmount}-${Date.now()}` },
                }))}>
                {t("invoice.pay")}
              </button>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
