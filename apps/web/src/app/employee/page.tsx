"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function EmployeePortalPage() {
  const { t } = useI18n();
  const [portal, setPortal] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    api<any>("/employees/me").then(setPortal).catch(() => {});
    api<any[]>("/employees/attendance/me").then(setAttendance).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function withLocation(fn: (lat: number, lng: number) => void) {
    setError("");
    setMsg("");
    if (!navigator.geolocation) {
      setError("Geolocation not available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fn(pos.coords.latitude, pos.coords.longitude),
      () => setError("Location permission is required for attendance"),
    );
  }

  async function checkIn() {
    withLocation(async (lat, lng) => {
      try {
        await api("/employees/attendance/check-in", { method: "POST", body: { lat, lng } });
        setMsg("✓ Checked in");
        load();
      } catch (err: any) {
        setError(err.message);
      }
    });
  }
  async function checkOut() {
    withLocation(async (lat, lng) => {
      try {
        await api("/employees/attendance/check-out", { method: "POST", body: { lat, lng } });
        setMsg("✓ Checked out");
        load();
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  async function accept(positionId: string) {
    setError("");
    try {
      await api(`/employees/positions/${positionId}/accept`, { method: "POST" });
      setMsg("✓ Position accepted — your contract record has been generated");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="stack" style={{ maxWidth: 720 }}>
        <h1>{t("nav.attendance")}</h1>
        {portal?.application && (
          <div className="card spread">
            <span>Application</span>
            <span className={`badge ${portal.application.status === "APPROVED" ? "success" : "warn"}`}>
              {portal.application.status}
            </span>
          </div>
        )}
        {portal?.positions?.filter((p: any) => p.status === "OFFERED").map((p: any) => (
          <div className="card stack" key={p.id}>
            <h2>{p.jobTitle}</h2>
            <p className="muted">
              {p.workStartTime}–{p.workEndTime} · {p.workDays}
              {p.salary ? ` · ${p.salary.toLocaleString()} IQD/month` : ""}
            </p>
            <p style={{ fontSize: 13 }}>{t("employee.agree")}</p>
            <button className="btn" onClick={() => accept(p.id)}>{t("employee.acceptPosition")}</button>
          </div>
        ))}
        <div className="card row">
          <button className="btn" onClick={checkIn}>{t("attendance.checkIn")}</button>
          <button className="btn secondary" onClick={checkOut}>{t("attendance.checkOut")}</button>
          {msg && <span className="muted">{msg}</span>}
          {error && <span className="error-text">{error}</span>}
        </div>
        <h2>{t("attendance.history")}</h2>
        <table className="data">
          <thead>
            <tr><th>{t("common.date")}</th><th>In</th><th>Out</th><th>{t("common.status")}</th></tr>
          </thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.workDate).toLocaleDateString()}</td>
                <td>{a.checkInAt ? new Date(a.checkInAt).toLocaleTimeString() : "—"}</td>
                <td>{a.checkOutAt ? new Date(a.checkOutAt).toLocaleTimeString() : "—"}</td>
                <td><span className={`badge ${a.status === "PRESENT" ? "success" : "warn"}`}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
