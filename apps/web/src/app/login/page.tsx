"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, homeFor, setToken, type Me } from "@/lib/api";
import { useI18n, LOCALE_NAMES } from "@/lib/i18n";
import type { Locale } from "@leen-life/localization";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Development sign-in path. Production uses Supabase Auth
      // (hosted login incl. OTP/MFA) and passes its JWT to the API.
      const res = await api<{ accessToken: string }>("/auth/dev-login", {
        method: "POST",
        body: { email, devPassword: password },
      });
      setToken(res.accessToken);
      const me = await api<Me>("/auth/me");
      router.push(homeFor(me.role.key));
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form className="card stack" style={{ width: 380 }} onSubmit={submit}>
        <div className="spread">
          <h1>{t("login.title")}</h1>
          <select
            className="input"
            style={{ width: "auto" }}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            {Object.entries(LOCALE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
        <p className="muted">{t("app.branch")}</p>
        <div>
          <label>{t("login.email")}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label>{t("login.password")}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" disabled={busy}>{t("login.submit")}</button>
        <p className="muted" style={{ fontSize: 12 }}>
          <Link href="/employee/signup">{t("employee.signup")} →</Link>
        </p>
      </form>
    </div>
  );
}
