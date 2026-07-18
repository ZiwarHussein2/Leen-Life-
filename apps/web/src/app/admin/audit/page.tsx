"use client";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AuditLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [action, setAction] = useState("");

  const load = () =>
    api<{ data: any[] }>(`/admin/audit-logs?action=${encodeURIComponent(action)}`)
      .then((r) => setLogs(r.data))
      .catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell>
      <div className="stack">
        <div className="spread">
          <h1>Audit logs</h1>
          <div className="row">
            <input className="input" placeholder="action filter e.g. discount." value={action} onChange={(e) => setAction(e.target.value)} />
            <button className="btn secondary" onClick={load}>{t("common.search")}</button>
          </div>
        </div>
        <table className="data" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>{t("common.date")}</th><th>Action</th><th>Object</th><th>Role</th><th>OK</th><th>Details</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td><code>{l.action}</code></td>
                <td>{l.objectType ?? "—"}</td>
                <td>{l.roleKey ?? "—"}</td>
                <td>{l.success ? "✓" : <span className="badge err">✗</span>}</td>
                <td className="muted" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.newValues ? JSON.stringify(l.newValues) : l.reason ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
