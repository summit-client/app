"use client";

import * as React from "react";
import { useParams } from "next/navigation";

/**
 * Documents — the client's file. Consent forms carry a real workflow
 * (not sent → sent → signed, all logged); organization guides give clinicians
 * the master reference material without hunting through a shared drive.
 */

const CONSENTS = [
  {
    id: "adjust-teaching",
    name: "Consent to Adjust Teaching Procedures",
    summary: "Why prompting strategies may change, how assent (willing participation) is ensured, and how caregiver consent is asked. Covers skill vs motivation vs motor-planning difficulty and prompt fading.",
  },
  {
    id: "toileting",
    name: "Toileting Support Consent Form",
    summary: "Risks and considerations around toileting support during programming: delayed access, accidents, personal-care support, clothing changes, temporary pausing of activities.",
  },
];

const DOCS = [
  { name: "Consent to service (signed)", date: "2026-01-12", kind: "Consent" },
  { name: "Individual treatment plan — Spring 2026", date: "2026-04-01", kind: "Treatment plan" },
  { name: "Behaviour support plan v2", date: "2026-05-19", kind: "BSP" },
  { name: "OAP funding confirmation", date: "2026-02-03", kind: "Funding" },
];

const GUIDES = [
  { name: "RBA Supervisor Guide V2 (2026)", note: "Supervision standards, sign-off expectations, video-review cadence." },
  { name: "BAR Report Writing Cheat Sheet", note: "Section-by-section guidance for the BAR — mirrored by the structured template's helper text." },
  { name: "Assessment instrument instructions (ABLLS-R · AFLS · ADL · MOTAS)", note: "The Excel-dashboard era instructions; scoring now happens in the Assessments tab." },
  { name: "Treatment Caseload Calendar 2026–2027", note: "Block boundaries drive the End-of-Block automation and banners." },
];

type ConsentStatus = "not_sent" | "sent" | "signed";
const STATUS_LABEL: Record<ConsentStatus, string> = { not_sent: "Not sent", sent: "Sent — awaiting signature", signed: "Signed" };
const STATUS_PILL: Record<ConsentStatus, string> = { not_sent: "neutral", sent: "warn", signed: "good" };

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const KEY = `summit-consents-${clientId}`;
  const [state, setState] = React.useState<Record<string, { status: ConsentStatus; at: string | null }>>({});

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw) as typeof state);
    } catch { /* start clean */ }
  }, [KEY]);

  const advance = (id: string) => {
    const cur = state[id]?.status ?? "not_sent";
    const next: ConsentStatus = cur === "not_sent" ? "sent" : "signed";
    const merged = { ...state, [id]: { status: next, at: new Date().toISOString() } };
    setState(merged);
    sessionStorage.setItem(KEY, JSON.stringify(merged));
  };

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>Consents</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CONSENTS.map((c) => {
          const s = state[c.id]?.status ?? "not_sent";
          return (
            <div key={c.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, maxWidth: "58ch" }}>
                <b>{c.name}</b>
                <p className="sub">{c.summary}</p>
                {state[c.id]?.at ? <p className="trend" style={{ marginTop: 4 }}>Last action {state[c.id]!.at!.slice(0, 10)} — logged.</p> : null}
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <span className={`pill ${STATUS_PILL[s]}`}>{STATUS_LABEL[s]}</span>
                {s !== "signed" ? (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn secondary" onClick={() => advance(c.id)}>
                      {s === "not_sent" ? "Send for signature" : "Mark signed"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="section-title">On file</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Document</th><th>Type</th><th>Date</th></tr></thead>
          <tbody>
            {DOCS.map((d) => (
              <tr key={d.name}>
                <td><b>{d.name}</b></td>
                <td><span className="pill neutral">{d.kind}</span></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{d.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Organization templates &amp; guides</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {GUIDES.map((g) => (
          <div key={g.name} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: "var(--text-sm)" }}>{g.name}</b>
            <span className="sub" style={{ marginTop: 0, maxWidth: "48ch" }}>{g.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
