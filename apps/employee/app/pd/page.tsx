"use client";

import * as React from "react";
import { addPd, getPd } from "@/lib/hub";

/** Professional Development — log PD entries; admins verify them. */
export default function PdPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [f, setF] = React.useState({ title: "", provider: "", hours: 1, date: new Date().toISOString().slice(0, 10) });
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading PD…</p>;

  const pd = getPd();
  const total = pd.reduce((s, r) => s + r.hours, 0);

  return (
    <div>
      <h1 className="h-page">Professional Development</h1>
      <p className="sub">Log workshops, courses and conference hours. Entries are verified by an administrator.</p>

      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="card tile"><div className="n">{total}</div><div className="l">Total PD hours</div></div>
        <div className="card tile"><div className="n">{pd.filter((r) => r.verified).length}</div><div className="l">Verified entries</div></div>
      </div>

      <h2 className="section-title">Add an entry</h2>
      <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 240 }}><label htmlFor="pd-title">Title</label>
          <input id="pd-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. OBM workshop" /></div>
        <div className="field"><label htmlFor="pd-provider">Provider</label>
          <input id="pd-provider" className="input" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></div>
        <div className="field" style={{ width: 110 }}><label htmlFor="pd-hours">Hours</label>
          <input id="pd-hours" type="number" min={0.5} step={0.5} className="input" value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) || 0 })} /></div>
        <div className="field"><label htmlFor="pd-date">Date</label>
          <input id="pd-date" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <button className="btn" disabled={!f.title.trim() || f.hours <= 0}
          onClick={() => void addPd(f).then(() => { setF({ title: "", provider: "", hours: 1, date: f.date }); force(); })}>
          Log PD
        </button>
      </div>

      <h2 className="section-title">Entries</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Title</th><th>Provider</th><th>Hours</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {pd.map((r) => (
              <tr key={r.id}>
                <td><b>{r.title}</b></td>
                <td>{r.provider || "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.hours}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                <td><span className={`pill ${r.verified ? "good" : "warn"}`}>{r.verified ? "verified" : "awaiting verification"}</span></td>
              </tr>
            ))}
            {!pd.length ? <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No PD logged yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
