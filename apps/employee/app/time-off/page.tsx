"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import {
  computeEntitlements, decideTimeOff, getProfile, getTimeOff, inclusiveDays, requestTimeOff,
} from "@/lib/hub";

const STATUS_PILL = { REQUESTED: "warn", APPROVED: "good", DENIED: "danger", CANCELLED: "neutral" } as const;

/** Time Off: balances per entitlement year (reset on the hire anniversary),
 * request form and history. Vacation follows the Ontario ESA; sick days are
 * organization policy. */
export default function TimeOffPage() {
  return (
    <HubGate>
      <TimeOffScreen />
    </HubGate>
  );
}

function TimeOffScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [f, setF] = React.useState({ type: "VACATION" as "VACATION" | "SICK", start: "", end: "", note: "" });
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading time off…</p>;

  const profile = getProfile();
  const requests = getTimeOff();
  const ent = profile.startDate ? computeEntitlements(profile.startDate, requests) : null;
  const days = f.start && f.end ? inclusiveDays(f.start, f.end) : 0;

  const submit = async () => {
    await requestTimeOff({ type: f.type, startDate: f.start, endDate: f.end, note: f.note });
    setF({ type: "VACATION", start: "", end: "", note: "" });
    force();
  };

  return (
    <div>
      <h1 className="h-page">Time Off</h1>
      <p className="sub">Balances reset on your hire anniversary{ent ? ` (${ent.nextReset})` : ""}. Requests go to your supervisor for approval.</p>

      {ent ? (
        <div className="tiles" style={{ marginTop: 16 }}>
          <div className="card tile"><div className="n">{ent.vacation.remaining}</div><div className="l">Vacation left · {ent.vacation.used} used · {ent.vacation.pending} pending · of {ent.vacation.entitled}</div></div>
          <div className="card tile"><div className="n">{ent.sick.remaining}</div><div className="l">Sick / mental-health left · {ent.sick.used} used · of {ent.sick.entitled}</div></div>
          <div className="card tile"><div className="n">{ent.serviceYears}</div><div className="l">Years of service{ent.serviceYears >= 5 ? " · senior vacation tier" : ""}</div></div>
        </div>
      ) : null}

      <h2 className="section-title">Request time off</h2>
      <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field"><label htmlFor="to-type">Type</label>
          <select id="to-type" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
            <option value="VACATION">Vacation</option>
            <option value="SICK">Sick / mental health</option>
          </select></div>
        <div className="field"><label htmlFor="to-start">First day</label>
          <input id="to-start" type="date" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
        <div className="field"><label htmlFor="to-end">Last day</label>
          <input id="to-end" type="date" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
        <div className="field" style={{ minWidth: 220 }}><label htmlFor="to-note">Note (optional)</label>
          <input id="to-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <button className="btn" onClick={submit} disabled={!f.start || !f.end || days === 0}>
          Request{days ? ` ${days} day${days === 1 ? "" : "s"}` : ""}
        </button>
      </div>

      <h2 className="section-title">History</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td><b>{r.type === "VACATION" ? "Vacation" : "Sick"}</b></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.startDate} → {r.endDate}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.days}</td>
                <td><span className={`pill ${STATUS_PILL[r.status]}`}>{r.status.toLowerCase()}</span></td>
                <td style={{ textAlign: "right" }}>
                  {r.status === "REQUESTED" ? (
                    <button className="btn ghost" onClick={() => void decideTimeOff(r.id, "CANCELLED").then(force)}>Cancel</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!requests.length ? <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No requests yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
