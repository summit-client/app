"use client";

import * as React from "react";
import { getSetting } from "@summit/settings";
import { getProfile } from "@/lib/hub";
import { checkRecognition, reciprocalFlag, RECOGNITION_CATEGORIES } from "@/lib/ecosystem";
import { currentCycle, hr, hrAudit, saveHr } from "@/lib/hr-store";

/**
 * Recognition. Peers reinforce specific behaviours close to when they happen.
 * Guardrails keep it from becoming a popularity contest: a monthly allowance,
 * a per-person cap, no self-recognition, duplicate detection and reciprocal
 * flagging. Recognition nudges the score modestly; objective performance
 * carries far more weight.
 */
export default function RecognitionPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [f, setF] = React.useState({ to: "", category: RECOGNITION_CATEGORIES[0], points: 1, message: "" });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading recognition…</p>;

  const s = hr();
  const me = getProfile().name;
  const cycle = currentCycle();
  const month = s.recognition.filter((r) => r.date.slice(0, 7) === cycle);
  const allowance = Number(getSetting("recog.monthlyAllowance")) || 10;
  const spent = month.filter((r) => r.from === me).reduce((n, r) => n + r.points, 0);
  const received = month.filter((r) => r.to === me);

  const teammates = s.team.length ? s.team.map((t) => t.name) : ["A colleague"];

  const send = () => {
    const check = checkRecognition({ ...f, from: me }, month);
    if (!check.allowed) { setError(check.reason); return; }
    const flag = reciprocalFlag({ from: me, to: f.to }, month);
    s.recognition.unshift({
      id: `r-${Date.now().toString(36)}`, from: me, to: f.to, category: f.category,
      points: f.points, message: f.message.trim(), date: new Date().toISOString(), flagged: flag,
    });
    saveHr();
    hrAudit("recognition.sent", `${f.points} ${f.category} to ${f.to}`);
    setF({ to: "", category: RECOGNITION_CATEGORIES[0], points: 1, message: "" });
    setError(null);
    force();
  };

  return (
    <div>
      <h1 className="h-page">Recognition</h1>
      <p className="sub" style={{ maxWidth: "70ch" }}>
        Recognize a specific behaviour a colleague showed. You have {allowance - spent} of {allowance} points left this
        month, and at most {String(getSetting("recog.maxPerPerson"))} points may go to any one person.
      </p>

      <h2 className="section-title">Recognize a colleague</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="r-to">Colleague</label>
            <input id="r-to" className="input" list="teammates" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="Name" />
            <datalist id="teammates">{teammates.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="field"><label htmlFor="r-cat">Category</label>
            <select id="r-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {RECOGNITION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field" style={{ width: 100 }}><label htmlFor="r-pts">Points</label>
            <input id="r-pts" type="number" min={1} max={4} className="input" value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) || 1 })} /></div>
        </div>
        <div className="field">
          <label htmlFor="r-msg">What did they do?</label>
          <textarea id="r-msg" className="input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })}
            placeholder="Describe the behaviour, for example: stayed to reset the room and prep materials for the next session." />
        </div>
        {error ? <p className="rule-note">{error}</p> : null}
        <div><button className="btn" onClick={send} disabled={!f.to.trim() || !f.message.trim()}>Send recognition</button></div>
      </div>

      <h2 className="section-title">You received</h2>
      <div className="attn">
        {received.map((r) => (
          <div key={r.id}>
            <span>+{r.points} {r.category}: {r.message}</span>
            <span className="trend">{r.date.slice(0, 10)}</span>
          </div>
        ))}
        {!received.length ? <div><span className="sub">Nothing yet this month.</span></div> : null}
      </div>

      <h2 className="section-title">Team wall</h2>
      <div className="attn">
        {month.slice(0, 12).map((r) => (
          <div key={r.id}>
            <span>{r.from} recognized {r.to}: +{r.points} {r.category}</span>
            <span className="trend">{r.flagged ? "flagged for manager review" : r.date.slice(0, 10)}</span>
          </div>
        ))}
        {!month.length ? <div><span className="sub">The wall is quiet this month.</span></div> : null}
      </div>
      <p className="sub">Recognition is visible to the team. Performance scores and feedback detail are not.</p>
    </div>
  );
}
