"use client";

import * as React from "react";
import { hr, hrAudit, saveHr } from "@/lib/hr-store";

/**
 * Policies & Handbook. Versioned documents with an open, read, acknowledge
 * trail. A new version resets acknowledgement so the record always names the
 * version the employee actually agreed to. Employment contracts, offer letters
 * and compensation agreements are out of scope for this module by design.
 */
export default function PoliciesPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [preview, setPreview] = React.useState<{ id: string; name: string; url: string | null; content: string | null } | null>(null);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading policies…</p>;

  const s = hr();
  const ackFor = (id: string, version: string) => s.acks.find((a) => a.policyId === id && a.version === version);

  const open = (id: string, version: string, name: string, url: string | null, content: string | null) => {
    let a = ackFor(id, version);
    if (!a) { a = { policyId: id, version, openedAt: new Date().toISOString(), acknowledgedAt: null }; s.acks.push(a); }
    else if (!a.openedAt) a.openedAt = new Date().toISOString();
    saveHr();
    hrAudit("policy.opened", `${name} version ${version}`);
    setPreview({ id, name, url: url ? (url.includes("drive.google.com") ? url.replace(/\/view.*$/, "/preview") : url) : null, content });
    force();
  };

  const acknowledge = (id: string, version: string, name: string) => {
    const a = ackFor(id, version);
    if (!a) return;
    a.acknowledgedAt = new Date().toISOString();
    saveHr();
    hrAudit("policy.acknowledged", `${name} version ${version}`, { next: version });
    force();
  };

  const outstanding = s.policies.filter((p) => p.required && !ackFor(p.id, p.version)?.acknowledgedAt).length;

  return (
    <div>
      <h1 className="h-page">Policies &amp; Handbook</h1>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        {outstanding > 0
          ? `${outstanding} required acknowledgement${outstanding === 1 ? "" : "s"} outstanding. Open a policy, read it, then acknowledge the version you read.`
          : "Every required policy acknowledgement is current."}
      </p>

      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <table className="data">
          <thead><tr><th>Policy</th><th>Version</th><th>Effective</th><th>Owner</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {s.policies.map((p) => {
              const a = ackFor(p.id, p.version);
              const status = a?.acknowledgedAt ? "acknowledged" : a?.openedAt ? "opened" : "not opened";
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b>{p.required ? <span className="pill neutral" style={{ marginLeft: 8 }}>required</span> : null}</td>
                  <td>{p.version}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.effectiveDate}</td>
                  <td>{p.owner}</td>
                  <td>
                    <span className={`pill ${a?.acknowledgedAt ? "good" : a?.openedAt ? "accent" : "warn"}`}>{status}</span>
                    {a?.acknowledgedAt ? <div className="trend">{a.acknowledgedAt.slice(0, 10)}</div> : null}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn ghost" onClick={() => open(p.id, p.version, p.name, p.url, p.content)}>
                      Preview
                    </button>
                    {a?.openedAt && !a.acknowledgedAt ? (
                      <button className="btn" style={{ marginLeft: 8 }} onClick={() => acknowledge(p.id, p.version, p.name)}>
                        Acknowledge
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview ? (
        <div className="card" style={{ marginTop: 14, overflow: "hidden" }}>
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontSize: "var(--text-sm)" }}>{preview.name}</b>
            <button className="btn ghost" onClick={() => setPreview(null)}>Close</button>
          </div>
          {preview.url ? (
            <iframe src={preview.url} title={`Preview of ${preview.name}`} style={{ width: "100%", height: "70vh", border: 0, display: "block" }} />
          ) : (
            <div className="card-pad" style={{ maxWidth: "72ch" }}>
              <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7 }}>{preview.content ?? "This policy's document has not been attached yet."}</p>
              <p className="trend" style={{ marginTop: 12 }}>Starter text. The signed organizational document replaces it when an administrator attaches it.</p>
            </div>
          )}
        </div>
      ) : null}

      <p className="sub" style={{ marginTop: 16 }}>
        Acknowledgement records the policy version, the moment you opened it and the moment you acknowledged it. When a
        policy changes materially, an administrator can require acknowledgement again.
      </p>
    </div>
  );
}
