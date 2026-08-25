"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  REVIEW_CATEGORY_LABEL,
  type CaseReview, type ClinicalEvidencePacket, type ReviewCategory, type SupervisionBrief,
} from "@summit/clinical-ai";

const CAT_PILL: Record<ReviewCategory, string> = {
  possible_regression: "danger", possible_plateau: "warn", implementation_concern: "danger",
  documentation_concern: "warn", insufficient_data: "neutral", approaching_mastery: "good",
  review_recommended: "accent", progressing_normally: "good",
};

export default function SupervisionPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [start, setStart] = React.useState(new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10));
  const [end, setEnd] = React.useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);
  const [review, setReview] = React.useState<CaseReview | null>(null);
  const [brief, setBrief] = React.useState<SupervisionBrief | null>(null);
  const [packet, setPacket] = React.useState<ClinicalEvidencePacket | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const prepare = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/supervision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, startDate: start, endDate: end }),
      });
      const data = await res.json();
      if (data.ok) { setReview(data.review); setBrief(data.brief); setPacket(data.packet); }
      else setError(data.error ?? "Case review failed.");
    } catch {
      setError("Case review could not be prepared. Your clinical data remains available.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link href={`/clients/${clientId}`} className="sub" style={{ color: "var(--accent)" }}>← Back to client</Link>
      <h1 className="h-page" style={{ marginTop: 8 }}>Supervision</h1>
      <p className="sub">
        Case review categories and the pre-supervision brief are computed deterministically from the evidence
        packet. You make the clinical decisions.
      </p>

      <div className="card card-pad" style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field"><label htmlFor="s-start">From</label>
          <input id="s-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label htmlFor="s-end">To</label>
          <input id="s-end" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <button className="btn lg" onClick={prepare} disabled={busy}>
          {busy ? "Reviewing the case…" : review ? "Refresh case review" : "Prepare case review"}
        </button>
      </div>

      {error ? <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}><p className="sub" style={{ color: "var(--ink)" }}>{error}</p></div> : null}

      {review ? (
        <>
          {/* CASE REVIEW: the organized categories */}
          <h2 className="section-title">Case review</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {review.categories.map((c) => (
              <div key={c.category} className="card card-pad">
                <span className={`pill ${CAT_PILL[c.category]}`}>{REVIEW_CATEGORY_LABEL[c.category]}</span>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.goals.map((g) => (
                    <li key={`${c.category}-${g.goalId}`} style={{ fontSize: "var(--text-sm)" }}>
                      <b>{g.goalName}</b> — <span style={{ color: "var(--muted)" }}>{g.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* SUPERVISION BRIEF: the thesis format, per goal */}
          {brief ? (
            <>
              <h2 className="section-title">Supervision brief · {brief.client.displayName}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {brief.goals.map((g, i) => (
                  <div key={g.goalName} className="card card-pad">
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <b>{i + 1}. {g.goalName}</b>
                      <span className={`pill ${g.trend === "Improving" ? "good" : g.trend === "Decreasing" ? "danger" : g.trend === "Plateau" ? "warn" : "neutral"}`}>
                        Trend: {g.trend}
                      </span>
                    </div>
                    <p className="trend" style={{ marginTop: 8 }}>
                      {g.baselinePct != null ? <>Baseline: <b>{g.baselinePct}%</b> · </> : null}
                      {g.currentMeanPct != null ? <>Current mean: <b>{g.currentMeanPct}%</b> · </> : null}
                      {g.lastPhaseChangeDaysAgo != null ? <>Last phase change: <b>{g.lastPhaseChangeDaysAgo} days ago</b> · </> : null}
                      {g.treatmentIntegrityPct != null ? <>Treatment integrity: <b>{g.treatmentIntegrityPct}%</b></> : null}
                    </p>
                    {g.masteryLine ? <p className="trend" style={{ marginTop: 4, color: "var(--good)" }}>{g.masteryLine}</p> : null}
                    {g.notePattern ? (
                      <p className="trend" style={{ marginTop: 4 }}>
                        Relevant note pattern <span className="sub">(clinician observation)</span>: {g.notePattern}
                      </p>
                    ) : null}
                    {g.reviewQuestions.length ? (
                      <>
                        <p className="sub" style={{ marginTop: 10, fontWeight: 600 }}>Suggested review questions:</p>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
                          {g.reviewQuestions.map((q) => <li key={q}>{q}</li>)}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ))}

                {brief.potentialNextGoals.length ? (
                  <div className="card card-pad">
                    <span className="pill accent">Suggested from Mount Etna Goal Bank</span>
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                      {brief.potentialNextGoals.map((n) => (
                        <li key={n.option} style={{ fontSize: "var(--text-sm)" }}>
                          <b>{n.option}</b> — <span style={{ color: "var(--muted)" }}>{n.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {brief.caregiverPriorities.length ? (
                  <div className="card card-pad">
                    <p className="sub" style={{ fontWeight: 600 }}>Caregiver priorities <span className="sub">(caregiver report)</span>:</p>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
                      {brief.caregiverPriorities.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  </div>
                ) : null}

                {packet ? (
                  <p className="sub">Packet {packet.packetId} · every value above is computed; nothing was generated by a model.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
