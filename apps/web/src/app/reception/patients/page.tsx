"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function PatientsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<any[]>([]);
  const [form, setForm] = useState({ fullName: "", yearOfBirth: "", phone: "", address: "" });
  const [msg, setMsg] = useState("");

  const search = () =>
    api<{ data: any[] }>(`/patients?q=${encodeURIComponent(q)}`).then((r) => setPatients(r.data)).catch(() => {});
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const p = await api<any>("/patients", {
        method: "POST",
        body: {
          fullName: form.fullName,
          yearOfBirth: form.yearOfBirth ? Number(form.yearOfBirth) : undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        },
      });
      setMsg(`${t("patients.code")}: ${p.patientCode}`);
      setForm({ fullName: "", yearOfBirth: "", phone: "", address: "" });
      search();
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  return (
    <Shell>
      <div className="grid cols-2">
        <div className="card stack">
          <h2>{t("common.search")}</h2>
          <div className="row">
            <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={`${t("patients.fullName")} / ${t("patients.phone")} / ${t("patients.code")}`} />
            <button className="btn" onClick={search}>{t("common.search")}</button>
          </div>
          <table className="data">
            <thead>
              <tr><th>{t("patients.code")}</th><th>{t("patients.fullName")}</th><th>{t("patients.phone")}</th><th /></tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>{p.patientCode}</td>
                  <td>{p.fullName}</td>
                  <td>{p.phone}</td>
                  <td><Link href={`/reception/invoices/new?patientId=${p.id}`}>{t("invoice.new")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card stack" onSubmit={create}>
          <h2>{t("patients.new")}</h2>
          <div><label>{t("patients.fullName")}</label>
            <input className="input" required minLength={3} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div><label>{t("patients.yearOfBirth")}</label>
            <input className="input" type="number" value={form.yearOfBirth} onChange={(e) => setForm({ ...form, yearOfBirth: e.target.value })} /></div>
          <div><label>{t("patients.phone")}</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>{t("patients.address")}</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          {msg && <p className="muted">{msg}</p>}
          <button className="btn">{t("common.create")}</button>
        </form>
      </div>
    </Shell>
  );
}
