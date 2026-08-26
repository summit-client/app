"use client";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import { getProgress, getTraining, onboardingProgress, refreshDue } from "@/lib/hub";
import { HUB_COURSES } from "@/lib/content";
import {
  AUTO_SOURCE_LABEL, computeAutoResponses, DEFAULT_METRICS, PEER_PROMPTS, RATING_SCALE, requiresExample,
  type RatingValue,
} from "@/lib/ecosystem";
import { currentCycle } from "@/lib/hr-store";
import { hr, hrAudit, saveHr } from "@/lib/hr-store";

/** Performance Checkin (self ratings) and Peer Reviews, shared by the
 * Scoreboard tabs. Peers come from the clinician's own team. */

export function Scale({ value, onPick, label }: { value?: RatingValue; onPick: (v: RatingValue) => void; label: string }) {
  return (
    <div className="scale-row" role="group" aria-label={label}>
      {RATING_SCALE.map((r) => (
        <button key={r.value} className={`scale-btn ${value === r.value ? "on" : ""}`} title={`${r.label}: ${r.short}`}
          aria-pressed={value === r.value} onClick={() => onPick(r.value)}>{r.value}</button>
      ))}
    </div>
  );
}

export function PerformanceCheckin({ onChange }: { onChange: () => void }) {
  const s = hr();
  const me = getProfile().name;
  const mine = new Map(s.responses.filter((r) => r.source === "SELF").map((r) => [r.metricKey, r]));
  const categories = [...new Set(DEFAULT_METRICS.map((m) => m.category))];

  // Auto-sourced values, derived live where the data exists on this device.
  const ob = onboardingProgress(getProgress());
  const training = getTraining();
  const dated = HUB_COURSES.filter((c) => c.deadlineBucket !== "CUSTOM");
  const doneCourses = new Set(training.filter((t) => t.status === "COMPLETED" && !refreshDue(t).due).map((t) => t.courseKey));
  const trainingPct = dated.length ? Math.round((dated.filter((c) => doneCourses.has(c.key)).length / dated.length) * 100) : null;
  const recogPoints = s.recognition.filter((r) => r.to === me && r.date.slice(0, 7) === currentCycle()).reduce((n, r) => n + r.points, 0);
  const auto = new Map(computeAutoResponses({ trainingPct, onboardingPct: ob.percent, recogPoints }).map((r) => [r.metricKey, r]));

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
        if (ms.every((m) => m.source === "PEER" && !m.auto)) return null; // peer-only categories live in Peer Reviews
        const weight = ms.reduce((n, m) => n + m.weight, 0);
        return (
          <React.Fragment key={cat}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22 }}>
              <b>{cat}</b>
              <span className="trend">{weight}% · {ms[0].type === "PERSONAL" ? "personal" : "group"}</span>
            </div>
            {ms.map((m) => {
              if (m.auto) {
                const derived = auto.get(m.key);
                return (
                  <div key={m.key} className="task-row" style={{ marginTop: 8, background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "var(--text-sm)", maxWidth: "50ch" }}>{m.behaviour}</span>
                      {derived ? (
                        <span className="pill accent">auto · {derived.rating} of 5</span>
                      ) : (
                        <span className="pill neutral">pending</span>
                      )}
                    </div>
                    <p className="trend" style={{ marginTop: 4 }}>
                      {derived ? derived.comment : `Pulls automatically from ${AUTO_SOURCE_LABEL[m.auto]}. No self-scoring.`}
                    </p>
                  </div>
                );
              }
              if (m.source === "PEER") return null; // rated by peers in the Peer Reviews tab
              const row = mine.get(m.key);
              return (
                <div key={m.key} className="task-row" style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)", maxWidth: "50ch" }}>{m.behaviour}</span>
                    <Scale value={row?.rating} onPick={(v) => rate(m.key, "SELF", v)} label={m.behaviour} />
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

export function PeerReviews({ onChange }: { onChange: () => void }) {
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
