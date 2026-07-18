"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function HrPage() {
  const { t } = useI18n();
  const [applications, setApplications] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ employeeUserId: "", jobTitle: "", salary: "", departmentId: "" });

  const load = () => {
    api<any[]>("/employees/applications").then(setApplications).catch(() => {});
    api<any[]>("/admin/departments").then(setDepartments).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    setError("");
    try {
      await api(`/employees/applications/${id}/review`, {
        method: "POST",
        body: { decision, ...(decision === "REJECTED" ? { rejectionReason: "Not suitable" } : {}) },
      });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/employees/positions", {
        method: "POST",
        body: {
          employeeUserId: position.employeeUserId,
          jobTitle: position.jobTitle,
          salary: position.salary ? Number(position.salary) : undefined,
          departmentId: position.departmentId || undefined,
        },
      });
      setPosition({ employeeUserId: "", jobTitle: "", salary: "", departmentId: "" });
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack">
        <h1>{t("nav.employees")}</h1>
        {error && <p className="error-text">{error}</p>}
        <table className="data">
          <thead>
            <tr><th>{t("patients.fullName")}</th><th>{t("login.email")}</th><th>{t("patients.phone")}</th><th>{t("common.status")}</th><th>{t("common.actions")}</th></tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id}>
                <td>{a.fullName}</td>
                <td>{a.email}</td>
                <td>{a.phone}</td>
                <td><span className={`badge ${a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "err" : "warn"}`}>{a.status}</span></td>
                <td className="row">
                  {a.status === "SUBMITTED" && (
                    <>
                      <button className="btn" onClick={() => review(a.id, "APPROVED")}>{t("common.approve")}</button>
                      <button className="btn danger" onClick={() => review(a.id, "REJECTED")}>{t("common.reject")}</button>
                    </>
                  )}
                  {a.status === "APPROVED" && (
                    <button className="btn secondary" onClick={() => setPosition({ ...position, employeeUserId: a.userId })}>
                      Assign job
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {position.employeeUserId && (
          <form className="card row" style={{ alignItems: "flex-end" }} onSubmit={assign}>
            <div style={{ flex: 1 }}><label>Job title</label>
              <input className="input" required value={position.jobTitle} onChange={(e) => setPosition({ ...position, jobTitle: e.target.value })} /></div>
            <div><label>Salary (IQD/month)</label>
              <input className="input" type="number" value={position.salary} onChange={(e) => setPosition({ ...position, salary: e.target.value })} /></div>
            <div><label>Department</label>
              <select className="input" value={position.departmentId} onChange={(e) => setPosition({ ...position, departmentId: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
            <button className="btn">Assign</button>
          </form>
        )}
      </div>
    </Shell>
  );
}
