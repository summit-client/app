"use client";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import {
  computeEcosystem, DEFAULT_METRICS, RATING_SCALE, requiresExample, SOURCE_LABEL,
  type MetricResponse, type RatingValue, type SourceKind,
} from "@/lib/ecosystem";
import { currentCycle, hr, hrAudit, saveHr } from "@/lib/hr-store";

/**
 * My Scorecard. Self reflection is entered here; peer, supervisor, objective
 * and professional-development inputs arrive from their own sources. Every
 * metric names an observable behaviour, rated on the anchored 1 to 5 scale.
 */
export default function ScorecardPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading scorecard…</p>;

  const s = hr();
  const profile = getProfile();
  const eco = computeEcosystem(s.responses);
  const selfMetrics = DEFAULT_METRICS.filter((m) => m.source === "SELF" || m.source === "PEER" || m.source === "OBJECTIVE" || m.source === "SUPERVISOR" || m.source === "PD");
  const byKey = new Map(s.responses.filter((r) => r.source === "SELF").map((r) => [r.metricKey, r]));

  const rate = (metricKey: string, rating: RatingValue) => {
    const existing = s.responses.find((r) => r.metricKey === metricKey && r.source === "SELF");
    const previous = existing?.rating;
    if (existing) existing.rating = rating;
    else s.responses.push({ metricKey, source: "SELF", rating, comment: "" });
    saveHr();
    hrAudit("scorecard.self_rating", `${metricKey} rated ${rating}`, { previous: previous ? String(previous) : undefined, next: String(rating) });
    force();
  };
  const comment = (metricKey: string, text: string) => {
    const r = s.responses.find((x) => x.metricKey === metricKey && x.source === "SELF");
    if (r) { r.comment = text; saveHr(); }
  };

  const domains = [...new Set(selfMetrics.map((m) => m.domain))];

  return (
    <div>
      <h1 className="h-page">My Scorecard</h1>
      <p className="sub" style={{ maxWidth: "70ch" }}>
        Cycle {currentCycle()}. Rate the behaviours you can observe in your own work. Your supervisor, peers and the
        objective data sources contribute the rest. Ratings describe behaviour, never personality.
      </p>

      <div className="stat-row">
        <div className="stat">
          <div className="v" style={{ color: "var(--accent)" }}>{eco.score ?? "—"}</div>
          <div className="k">Ecosystem Score</div>
        </div>
        {eco.breakdown.map((b) => (
          <div className="stat" key={b.source}>
            <div className="v" style={{ fontSize: "var(--text-lg)" }}>{b.meanRating ?? "—"}</div>
            <div className="k">{SOURCE_LABEL[b.source]} · {b.weightPct}%</div>
            <div className="d trend">{b.responses} response{b.responses === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>
      {eco.missing.length ? (
        <p className="sub">Waiting on: {eco.missing.join(", ")}. Absent sources are excluded from the score rather than counted as zero.</p>
      ) : null}

      <h2 className="section-title">Rating scale</h2>
      <div className="attn">
        {RATING_SCALE.map((r) => (
          <div key={r.value}><span><b>{r.value} · {r.label}</b> {r.anchor}</span></div>
        ))}
      </div>

      {domains.map((d) => (
        <React.Fragment key={d}>
          <h2 className="section-title">{d}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selfMetrics.filter((m) => m.domain === d).map((m) => {
              const row = byKey.get(m.key);
              const mine = m.source === "SELF" || m.source === "PEER" || m.source === "SUPERVISOR" || m.source === "OBJECTIVE" || m.source === "PD";
              return (
                <div key={m.key} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <b style={{ fontSize: "var(--text-sm)", maxWidth: "58ch" }}>{m.behaviour}</b>
                    <span className="pill neutral">{SOURCE_LABEL[m.source]}</span>
                  </div>
                  {mine ? (
                    <>
                      <div className="scale-row" style={{ marginTop: 10 }} role="group" aria-label={`Rating for ${m.behaviour}`}>
                        {RATING_SCALE.map((r) => (
                          <button key={r.value} className={`scale-btn ${row?.rating === r.value ? "on" : ""}`}
                            aria-pressed={row?.rating === r.value} title={r.anchor}
                            onClick={() => rate(m.key, r.value)}>
                            {r.value}
                          </button>
                        ))}
                      </div>
                      {row && requiresExample(row.rating) ? (
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor={`c-${m.key}`}>An example helps. What happened, and what would improvement look like?</label>
                          <textarea id={`c-${m.key}`} className="input" rows={2} defaultValue={row.comment}
                            onChange={(e) => comment(m.key, e.target.value)} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}

      <h2 className="section-title">Support</h2>
      <div className="card card-pad">
        <div className="field">
          <label htmlFor="support">What support or resource would help you thrive next month?</label>
          <textarea id="support" className="input" rows={3}
            defaultValue={s.responses.find((r) => r.metricKey === "support-request")?.comment ?? ""}
            onChange={(e) => {
              const r = s.responses.find((x) => x.metricKey === "support-request");
              if (r) r.comment = e.target.value;
              else s.responses.push({ metricKey: "support-request", source: "SELF", rating: 3, comment: e.target.value });
              saveHr();
            }} />
        </div>
        <p className="sub">Shared with your supervisor. Answers here shape team support, not your score.</p>
      </div>

      <p className="sub" style={{ marginTop: 16 }}>
        Signed in as {profile.name}. Your individual score is private to you, your supervisor and HR.
      </p>
    </div>
  );
}
