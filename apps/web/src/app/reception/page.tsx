"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ReceptionHome() {
  const { t } = useI18n();
  const [queues, setQueues] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/queues").then(setQueues).catch(() => {});
  }, []);

  const byDept = new Map<string, { name: string; waiting: number; inProgress: number; done: number }>();
  for (const q of queues) {
    const cur = byDept.get(q.department.id) ?? { name: q.department.name, waiting: 0, inProgress: 0, done: 0 };
    if (q.status === "WAITING") cur.waiting++;
    else if (q.status === "IN_PROGRESS") cur.inProgress++;
    else if (q.status === "DONE") cur.done++;
    byDept.set(q.department.id, cur);
  }

  return (
    <Shell>
      <div className="stack">
        <div className="spread">
          <h1>{t("nav.dashboard")}</h1>
          <div className="row">
            <Link className="btn" href="/reception/patients">{t("patients.new")}</Link>
            <Link className="btn secondary" href="/reception/invoices/new">{t("invoice.new")}</Link>
            <Link className="btn secondary" href="/reception/reports">{t("reports.waiting")}</Link>
          </div>
        </div>
        <div className="grid cols-4">
          {[...byDept.values()].map((d) => (
            <div className="card" key={d.name}>
              <div className="stat-label">{d.name}</div>
              <div className="stat">{d.waiting}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t("queue.inProgress")}: {d.inProgress} · {t("queue.done")}: {d.done}
              </div>
            </div>
          ))}
          {byDept.size === 0 && <p className="muted">{t("queue.waiting")}: 0</p>}
        </div>
      </div>
    </Shell>
  );
}
