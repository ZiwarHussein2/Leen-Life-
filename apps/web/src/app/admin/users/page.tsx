"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const ROLE_KEYS = [
  "BRANCH_ADMIN", "ACCOUNTING", "RECEPTION", "DEPARTMENT_OPERATOR",
  "SONAR_DOCTOR", "REPORT_DOCTOR", "EMPLOYEE",
];

export default function UsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [form, setForm] = useState({ fullName: "", email: "", roleKey: "RECEPTION", departmentId: "" });
  const [error, setError] = useState("");

  const load = () => {
    api<any[]>("/admin/users").then(setUsers).catch(() => {});
    api<any[]>("/admin/departments").then(setDepartments).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/users", {
        method: "POST",
        body: { ...form, departmentId: form.departmentId || undefined },
      });
      setForm({ fullName: "", email: "", roleKey: "RECEPTION", departmentId: "" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.admin")}</h1>
        <form className="card row" onSubmit={create} style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}><label>{t("patients.fullName")}</label>
            <input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label>{t("login.email")}</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label>Role</label>
            <select className="input" value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
              {ROLE_KEYS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div><label>Department</label>
            <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">—</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <button className="btn">{t("common.create")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
        <table className="data">
          <thead>
            <tr><th>{t("patients.fullName")}</th><th>{t("login.email")}</th><th>Role</th><th>Department</th><th>MFA</th><th>{t("common.status")}</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role.key}</td>
                <td>{u.department?.name ?? "—"}</td>
                <td>{u.mfaRequired ? <span className="badge ok">Required</span> : "—"}</td>
                <td><span className={`badge ${u.status === "ACTIVE" ? "success" : "warn"}`}>{u.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
