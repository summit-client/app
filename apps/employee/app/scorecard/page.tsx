"use client";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import {
  BAND_LABEL, computeEcosystem, DEFAULT_METRICS, PEER_PROMPTS, RATING_SCALE, requiresExample,
  type RatingValue,
} from "@/lib/ecosystem";
import { currentCycle, hr, hrAudit, saveHr } from "@/lib/hr-store";
import { EggToast, ScoreRing, useEasterEggs } from "@/components/grove";

/**
 * My Scorecard. Self ratings and peer feedback in one place, because they are
 * one monthly act. Peers are pulled from the clinician's own team, so nothing
 * is prefilled with names.
 */
export default function ScorecardPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = React.useState<"self" | "peers">("self");
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const s = hr();
  const eco = computeEcosystem(s.responses);

  return (
    <div>
      <EggToast toast={eggs.toast} />
      <div className="hero">
        <div className="hero-figure"><ScoreRing value={eco.score} /></div>
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}>My Scorecard</h1>
          <p className="sub" style={{ marginTop: 0 }}>{currentCycle()}</p>
          <div className="split">
            <span className="split-bar" role="img" aria-label={`Personal ${eco.personal.percent}, group ${eco.group.percent}`}>
              <span className="me" style={{ width: `${eco.personal.percent / 2}%` }}>me {eco.personal.percent || ""}</span>
              <span className="team" style={{ width: `${eco.group.percent / 2}%` }}>team {eco.group.percent || ""}</span>
            </span>
          </div>
          {eco.band ? <p className={`hero-band ${eco.band === "BONUS" ? "bonus" : eco.band === "FEEDBACK_PLAN" ? "plan" : "coach"}`} style={{ marginTop: 8 }}>{BAND_LABEL[eco.band]}</p> : null}
        </div>
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Scorecard sections">
        {([["self", "My ratings"], ["peers", `Peers (${s.team.length})`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`mode-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "self" ? <SelfTab onChange={force} /> : <PeerTab onChange={force} />}
    </div>
  );
}

function Scale({ value, onPick, label }: { value?: RatingValue; onPick: (v: RatingValue) => void; label: string }) {
  return (
    <div className="scale-row" role="group" aria-label={label}>
      {RATING_SCALE.map((r) => (
        <button key={r.value} className={`scale-btn ${value === r.value ? "on" : ""}`} title={`${r.label}: ${r.short}`}
          aria-pressed={value === r.value} onClick={() => onPick(r.value)}>{r.value}</button>
      ))}
    </div>
  );
}

function SelfTab({ onChange }: { onChange: () => void }) {
  const s = hr();
  const mine = new Map(s.responses.filter((r) => r.source === "SELF" || r.source === "OBJECTIVE" || r.source === "SUPERVISOR" || r.source === "PD").map((r) => [r.metricKey, r]));
  const categories = [...new Set(DEFAULT_METRICS.map((m) => m.category))];

  const rate = (key: string, source: string, rating: RatingValue) => {
    const ex = s.responses.find((r) => r.metricKey === key && r.source === source);
    const prev = ex?.rating;
    if (ex) ex.rating = rating;
    else s.responses.push({ metricKey: key, source: source as never, rating, comment: "" });
    saveHr();
    hrAudit("scorecard.rating", `${key} = ${rating}`, { previous: prev ? String(prev) : undefined, next: String(rating) });
    onChange();
  };

  return (
    <div style={{ marginTop: 16 }}>
      {categories.map((cat) => {
        const ms = DEFAULT_METRICS.filter((m) => m.category === cat);
        const weight = ms.reduce((n, m) => n + m.weight, 0);
        return (
          <React.Fragment key={cat}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22 }}>
              <b>{cat}</b>
              <span className="trend">{weight}% · {ms[0].type === "PERSONAL" ? "personal" : "group"}</span>
            </div>
            {ms.map((m) => {
              const row = mine.get(m.key);
              return (
                <div key={m.key} className="task-row" style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)", maxWidth: "50ch" }}>{m.behaviour}</span>
                    <Scale value={row?.rating} onPick={(v) => rate(m.key, m.source, v)} label={m.behaviour} />
                  </div>
                  {row && requiresExample(row.rating) ? (
                    <textarea className="input" rows={2} style={{ marginTop: 8 }} defaultValue={row.comment}
                      aria-label={`Example for ${m.behaviour}`} placeholder="What happened, and what would help?"
                      onChange={(e) => { row.comment = e.target.value; saveHr(); }} />
                  ) : null}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
      <div className="field" style={{ marginTop: 24 }}>
        <label htmlFor="support">What would help you next month?</label>
        <textarea id="support" className="input" rows={2}
          defaultValue={s.responses.find((r) => r.metricKey === "support-request")?.comment ?? ""}
          onChange={(e) => {
            const r = s.responses.find((x) => x.metricKey === "support-request");
            if (r) r.comment = e.target.value;
            else s.responses.push({ metricKey: "support-request", source: "SELF", rating: 3, comment: e.target.value });
            saveHr();
          }} />
      </div>
    </div>
  );
}

function PeerTab({ onChange }: { onChange: () => void }) {
  const s = hr();
  const me = getProfile().name;
  const peers = s.team.filter((t) => t.name !== me);
  const [subject, setSubject] = React.useState("");
  const [ratings, setRatings] = React.useState<Record<string, RatingValue>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const peerMetrics = DEFAULT_METRICS.filter((m) => m.source === "PEER");

  if (!peers.length) {
    return (
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <b>No teammates yet</b>
        <p className="sub">Your peer list comes from your team. Add colleagues in My Team to review them here.</p>
      </div>
    );
  }

  const submit = () => {
    for (const [metricKey, rating] of Object.entries(ratings)) {
      s.responses.push({ metricKey, source: "PEER", rating, comment: notes[metricKey] ?? "", subject, rater: "anonymous" });
    }
    for (const p of PEER_PROMPTS) {
      if (notes[p.key]?.trim()) s.responses.push({ metricKey: p.key, source: "PEER", rating: 3, comment: notes[p.key], subject, rater: "anonymous" });
    }
    saveHr();
    hrAudit("peer_feedback.submitted", `Feedback for ${subject}`);
    setRatings({}); setNotes({}); setSubject("");
    onChange();
  };

  const blocked = Object.entries(ratings).some(([k, v]) => requiresExample(v) && !(notes[k] ?? "").trim());
  const reviewed = new Set(s.responses.filter((r) => r.source === "PEER" && r.subject).map((r) => r.subject));

  return (
    <div style={{ marginTop: 16 }}>
      <div className="chip-row">
        {peers.map((p) => (
          <button key={p.name} className={`mode-tab ${subject === p.name ? "active" : ""}`} onClick={() => setSubject(p.name)}>
            {reviewed.has(p.name) ? "✓ " : ""}{p.name}
          </button>
        ))}
      </div>

      {subject ? (
        <div style={{ marginTop: 16 }}>
          {peerMetrics.map((m) => (
            <div key={m.key} className="task-row" style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--text-sm)", maxWidth: "50ch" }}>{m.behaviour}</span>
                <Scale value={ratings[m.key]} onPick={(v) => setRatings({ ...ratings, [m.key]: v })} label={m.behaviour} />
              </div>
              {ratings[m.key] && requiresExample(ratings[m.key]) ? (
                <textarea className="input" rows={2} style={{ marginTop: 8 }} value={notes[m.key] ?? ""}
                  aria-label={`Example for ${m.behaviour}`} placeholder="What happened, and what would help?"
                  onChange={(e) => setNotes({ ...notes, [m.key]: e.target.value })} />
              ) : null}
            </div>
          ))}

          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: "var(--text-sm)" }}>Two stars and a wish</b>
            {PEER_PROMPTS.map((p) => (
              <div className="field" key={p.key} style={{ marginTop: 8 }}>
                <label htmlFor={`pp-${p.key}`}>{p.label}</label>
                <input id={`pp-${p.key}`} className="input" value={notes[p.key] ?? ""} onChange={(e) => setNotes({ ...notes, [p.key]: e.target.value })} />
              </div>
            ))}
          </div>

          {blocked ? <p className="rule-note">A 1 or 2 needs an example.</p> : null}
          <button className="btn" style={{ marginTop: 14 }} onClick={submit} disabled={!Object.keys(ratings).length || blocked}>
            Submit for {subject}
          </button>
          <p className="sub">Anonymous to your teammate. They see themes, not names.</p>
        </div>
      ) : (
        <p className="sub" style={{ marginTop: 16 }}>Pick a teammate to review.</p>
      )}
    </div>
  );
}
