"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function EmployeeSignupPage() {
  const { t } = useI18n();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", dob: "", address: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/v1/employees/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card stack" style={{ width: 440 }}>
        <h1>{t("employee.signup")}</h1>
        <p className="muted">{t("app.branch")}</p>
        {done ? (
          <>
            <span className="badge success" style={{ padding: "8px 16px" }}>
              ✓ Application submitted. Verify your email (OTP) and wait for admin review.
            </span>
            <p className="muted" style={{ fontSize: 12 }}>
              ID card photos (front/back) are uploaded after email verification in the production
              flow via Supabase Auth.
            </p>
            <Link href="/login">{t("login.title")} →</Link>
          </>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div><label>{t("patients.fullName")}</label>
              <input className="input" required minLength={3} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div><label>{t("login.email")}</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label>{t("patients.phone")}</label>
              <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label>Date of birth</label>
              <input className="input" type="date" required value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
            <div><label>{t("patients.address")}</label>
              <input className="input" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn">{t("employee.apply")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
