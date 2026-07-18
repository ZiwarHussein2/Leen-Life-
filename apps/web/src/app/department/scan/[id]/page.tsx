"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api, getToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ScanOperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [scan, setScan] = useState<any>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [usage, setUsage] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<any>(`/scans/${id}`).then(setScan).catch((e) => setError(e.message));
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

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/v1/scans/${id}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Upload failed");
      }
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!scan) return <Shell><p>{t("common.loading")}</p></Shell>;
  const recipes = scan.invoiceItem.test.assetRecipes ?? [];

  return (
    <Shell>
      <div className="stack" style={{ maxWidth: 760 }}>
        <div className="spread">
          <h1>{scan.patient?.patientCode} — {scan.patient?.fullName}</h1>
          <span className="badge ok">{scan.status}</span>
        </div>
        <p className="muted">{scan.invoiceItem.test.nameEn}</p>
        {error && <p className="error-text">{error}</p>}

        <div className="card stack">
          <h2>{t("scan.upload")}</h2>
          <input
            className="input"
            type="file"
            accept=".zip,application/zip"
            disabled={uploading || scan.status === "COMPLETED"}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {scan.files?.length > 0 && (
            <ul className="muted" style={{ paddingInlineStart: 20 }}>
              {scan.files.map((f: any) => (
                <li key={f.id}>{f.originalName} ({Math.round(Number(f.sizeBytes) / 1024)} KB) — {f.scanStatus}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card stack">
          <h2>{t("scan.assetUsage")}</h2>
          {scan.assetUsageRecords?.length > 0 ? (
            <table className="data">
              <thead><tr><th>Item</th><th>Expected</th><th>Entered</th><th>{t("common.status")}</th></tr></thead>
              <tbody>
                {scan.assetUsageRecords.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.item.nameEn}</td>
                    <td>{r.expectedQuantity}</td>
                    <td>{r.departmentEnteredQuantity}</td>
                    <td><span className="badge">{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              {recipes.map((r: any) => (
                <div className="row" key={r.inventoryItemId}>
                  <span style={{ flex: 1 }}>{r.item.nameEn} <span className="muted">(expected {r.expectedQuantity})</span></span>
                  <input className="input" style={{ width: 90 }} type="number" min={0}
                    placeholder={String(r.expectedQuantity)}
                    value={usage[r.inventoryItemId] ?? ""}
                    onChange={(e) => setUsage({ ...usage, [r.inventoryItemId]: e.target.value })} />
                </div>
              ))}
              <button className="btn secondary"
                onClick={() => act(() => api(`/scans/${id}/asset-usage`, {
                  method: "POST",
                  body: {
                    entries: recipes.map((r: any) => ({
                      inventoryItemId: r.inventoryItemId,
                      quantity: Number(usage[r.inventoryItemId] ?? r.expectedQuantity),
                    })),
                  },
                }))}>
                {t("common.save")}
              </button>
            </>
          )}
        </div>

        <div className="row">
          <button className="btn" disabled={scan.status !== "STARTED"}
            onClick={() => act(() => api(`/scans/${id}/scan-done`, { method: "POST" }))}>
            {t("scan.scanDone")}
          </button>
          <button className="btn" disabled={scan.status !== "SCAN_DONE"}
            onClick={() => act(() => api(`/scans/${id}/printing-done`, { method: "POST" }))}>
            {t("scan.printingDone")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
