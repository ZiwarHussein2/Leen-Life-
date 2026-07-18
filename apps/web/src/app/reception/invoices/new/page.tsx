"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "@/components/shell";
import { api, fmtIQD } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function NewInvoiceInner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [patientId, setPatientId] = useState(params.get("patientId") ?? "");
  const [patients, setPatients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: any[] }>("/patients?pageSize=100").then((r) => setPatients(r.data)).catch(() => {});
    api<any[]>("/services?active=true").then(setServices).catch(() => {});
    api<any[]>("/referrals/partners").then(setPartners).catch(() => {});
  }, []);

  const nameOf = (s: any) => (locale === "ar" ? s.nameAr : locale === "ku" ? s.nameKu : s.nameEn);
  const estimate = selected.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.basePrice ?? 0), 0);

  async function create() {
    setError("");
    try {
      const invoice = await api<any>("/invoices", {
        method: "POST",
        body: {
          patientId,
          referralPartnerId: partnerId || undefined,
          items: selected.map((testId) => ({ testId })),
        },
      });
      router.push(`/reception/invoices/${invoice.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>{t("invoice.new")}</h1>
      <div className="card stack">
        <div>
          <label>{t("queue.patient")}</label>
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">—</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.patientCode} — {p.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label>{t("invoice.referral")}</label>
          <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">—</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>{t("invoice.addTest")}</label>
          <div className="stack" style={{ gap: 6, maxHeight: 300, overflowY: "auto" }}>
            {services.map((s) => (
              <label key={s.id} className="row" style={{ fontWeight: 400, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))
                  }
                />
                <span style={{ flex: 1 }}>{nameOf(s)} <span className="muted">({s.department.name})</span></span>
                <span>{fmtIQD(s.basePrice)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="spread">
          <span className="muted">{t("invoice.subtotal")} ≈ {fmtIQD(estimate)}</span>
          <button className="btn" disabled={!patientId || selected.length === 0} onClick={create}>
            {t("common.create")}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        <p className="muted" style={{ fontSize: 12 }}>
          Final prices (including time-based MRI/CT pricing) are computed by the server at creation time.
        </p>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Shell>
      <Suspense>
        <NewInvoiceInner />
      </Suspense>
    </Shell>
  );
}
