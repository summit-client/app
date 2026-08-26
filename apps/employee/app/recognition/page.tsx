"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getSetting } from "@summit/settings";
import { getProfile } from "@/lib/hub";
import { checkRecognition, reciprocalFlag, RECOGNITION_CATEGORIES } from "@/lib/ecosystem";
import { currentCycle, hr, sendRecognition } from "@/lib/hr-store";
import { useHrAction, WriteError } from "@/components/hr-provider";
import { EggToast, Sparks, useEasterEggs } from "@/components/grove";

/**
 * Recognition. Sparks of appreciation from your team, and the climb: your
 * elevation up the mountain, where the camps are the career pathway.
 */

const AWARDS = [
  { at: 5, name: "First Spark", note: "5 points of appreciation" },
  { at: 12, name: "Rising Ember", note: "12 points" },
  { at: 25, name: "Signal Fire", note: "25 points" },
  { at: 40, name: "Summit Beacon", note: "40 points" },
];

export default function RecognitionPage() {
  return (
    <HrGate>
      <RecognitionScreen />
    </HrGate>
  );
}

function RecognitionScreen() {
  const { run, error: writeError, clearError } = useHrAction();
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [f, setF] = React.useState({ to: "", category: RECOGNITION_CATEGORIES[0], points: 1, message: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [sparkOn, setSparkOn] = React.useState(false);
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const s = hr();
  const me = getProfile().name;
  const cycle = currentCycle();
  const month = s.recognition.filter((r) => r.date.slice(0, 7) === cycle);
  const allowance = Number(getSetting("recog.monthlyAllowance")) || 10;
  const spent = month.filter((r) => r.from === me).reduce((n, r) => n + r.points, 0);
  const received = month.filter((r) => r.to === me);
  const receivedAll = s.recognition.filter((r) => r.to === me).reduce((n, r) => n + r.points, 0);
  const earned = AWARDS.filter((a) => receivedAll >= a.at);

  const send = () => {
    const check = checkRecognition({ ...f, from: me }, month);
    if (!check.allowed) { setError(check.reason); return; }
    void run(async () => {
      await sendRecognition({
        from: me, to: f.to, category: f.category, points: f.points,
        message: f.message.trim(), flagged: reciprocalFlag({ from: me, to: f.to }, month),
      });
    });
    setF({ to: "", category: RECOGNITION_CATEGORIES[0], points: 1, message: "" });
    setError(null);
    setSparkOn(true);
    setTimeout(() => setSparkOn(false), 900);
    force();
  };

  return (
    <div>
      <WriteError error={writeError} onDismiss={clearError} />
      <EggToast toast={eggs.toast} />
      <div className="hero">
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}>Recognition <Sparks run={sparkOn} /></h1>
          <p className="sub" style={{ marginTop: 0 }}>{allowance - spent} of {allowance} points left to give this month</p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            {AWARDS.map((a) => (
              <span key={a.name} className={`pill ${earned.includes(a) ? "good" : "neutral"}`} title={a.note}>
                {earned.includes(a) ? "✦ " : ""}{a.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <h2 className="section-title">Send a spark</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="r-to">Colleague</label>
            <input id="r-to" className="input" list="teammates" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="Name" />
            <datalist id="teammates">{s.team.filter((t) => t.name !== me).map((t) => <option key={t.name} value={t.name} />)}</datalist>
          </div>
          <div className="field"><label htmlFor="r-cat">Category</label>
            <select id="r-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {RECOGNITION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field" style={{ width: 96 }}><label htmlFor="r-pts">Points</label>
            <input id="r-pts" type="number" min={1} max={5} className="input" value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) || 1 })} /></div>
        </div>
        <div className="field">
          <label htmlFor="r-msg">What did they do?</label>
          <textarea id="r-msg" className="input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })}
            placeholder="The specific behaviour, for example: stayed to reset the room for the next session." />
        </div>
        {error ? <p className="rule-note">{error}</p> : null}
        <div><button className="btn" onClick={send} disabled={!f.to.trim() || !f.message.trim()}>Send spark</button></div>
      </div>

      <h2 className="section-title">Sparks of appreciation <Sparks run={sparkOn} /></h2>
      <div className="attn">
        {received.map((r) => (
          <div key={r.id}>
            <span>✦ +{r.points} {r.category}: {r.message}</span>
            <span className="trend">{r.from} · {r.date.slice(0, 10)}</span>
          </div>
        ))}
        {!received.length ? <div><span className="sub">Nothing yet this month.</span></div> : null}
      </div>

      <h2 className="section-title">Team wall</h2>
      <div className="attn">
        {month.slice(0, 12).map((r) => (
          <div key={r.id}>
            <span>{r.from} → {r.to}: +{r.points} {r.category}</span>
            <span className="trend">{r.flagged ? "manager review" : r.date.slice(0, 10)}</span>
          </div>
        ))}
        {!month.length ? <div><span className="sub">The wall is quiet this month.</span></div> : null}
      </div>
    </div>
  );
}
