/** Public QR verification page (spec §16) — server-rendered, minimal data. */

interface VerifyResult {
  verified: boolean;
  reportId?: string;
  patientCode?: string;
  patientName?: string;
  testName?: string;
  department?: string;
  reportDoctor?: string;
  reportDate?: string;
  branch?: string;
  message?: string;
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const apiBase = process.env.API_BASE_URL ?? "http://localhost:3001";
  let result: VerifyResult = { verified: false };
  try {
    const res = await fetch(`${apiBase}/api/v1/reports/verify/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (res.ok) result = await res.json();
  } catch {
    // fall through to unverified
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card stack" style={{ width: 420, textAlign: "center" }}>
        <h1>Leen Life Medical Complex</h1>
        {result.verified ? (
          <>
            <span className="badge success" style={{ justifySelf: "center", fontSize: 14, padding: "6px 16px" }}>
              ✓ {result.message ?? "This report is genuine"}
            </span>
            <table className="data" style={{ textAlign: "start" }}>
              <tbody>
                <tr><td className="muted">Report ID</td><td>{result.reportId}</td></tr>
                <tr><td className="muted">Patient</td><td>{result.patientCode} — {result.patientName}</td></tr>
                <tr><td className="muted">Test</td><td>{result.testName}</td></tr>
                <tr><td className="muted">Department</td><td>{result.department}</td></tr>
                <tr><td className="muted">Report doctor</td><td>{result.reportDoctor}</td></tr>
                <tr><td className="muted">Date</td><td>{result.reportDate ? new Date(result.reportDate).toLocaleString() : "—"}</td></tr>
                <tr><td className="muted">Branch</td><td>{result.branch}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>
              Full medical content is available only to authorized Leen Life staff.
            </p>
          </>
        ) : (
          <span className="badge err" style={{ fontSize: 14, padding: "6px 16px" }}>
            ✗ Report could not be verified
          </span>
        )}
      </div>
    </div>
  );
}
