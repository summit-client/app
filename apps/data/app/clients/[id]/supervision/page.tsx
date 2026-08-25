"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  REVIEW_CATEGORY_LABEL,
  type CaseReview, type ClinicalDecisionTree, type ClinicalEvidencePacket, type ReviewCategory, type SupervisionBrief,
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
                    {(g.trend === "Plateau" || g.trend === "Decreasing") && packet ? (
                      <DecisionTreePanel
                        clientId={clientId}
                        goalId={packet.goals.find((x) => x.goalName === g.goalName)?.goalId ?? ""}
                        pattern={g.trend === "Plateau" ? "Skill plateau" : "Skill regression"}
                      />
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

      <SupervisionNoteComposer clientId={clientId} />
    </div>
  );
}

/**
 * Supervision meeting notes — the Master Client Supervision Template as a
 * structured composer: follow-up items, observations/recommendations, and a
 * "read by clinician" acknowledgement, kept per client with history.
 */
function SupervisionNoteComposer({ clientId }: { clientId: number }) {
  interface SupNote { followUp: string; observations: string; readBy: string; at: string }
  const KEY = `summit-supervision-notes-${clientId}`;
  const [notes, setNotes] = React.useState<SupNote[]>([]);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ followUp: "", observations: "", readBy: "" });

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw) as SupNote[]);
    } catch { /* start clean */ }
  }, [KEY]);

  const save = () => {
    const next = [{ ...draft, at: new Date().toISOString() }, ...notes];
    setNotes(next);
    sessionStorage.setItem(KEY, JSON.stringify(next));
    setDraft({ followUp: "", observations: "", readBy: "" });
    setOpen(false);
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Supervision meeting notes</h2>
        <button className="btn secondary" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "+ New meeting note"}</button>
      </div>
      {open ? (
        <div className="card card-pad" style={{ marginTop: 10, display: "grid", gap: 12 }}>
          <div className="field"><label htmlFor="sn-follow">Follow-up items</label>
            <textarea id="sn-follow" className="input" rows={3} value={draft.followUp}
              placeholder="e.g. Team submits 2–3 clips per week showing program implementation for fidelity review…"
              onChange={(e) => setDraft({ ...draft, followUp: e.target.value })} /></div>
          <div className="field"><label htmlFor="sn-obs">Observations / session notes &amp; recommendations</label>
            <textarea id="sn-obs" className="input" rows={4} value={draft.observations}
              placeholder="Clinical recommendations, environmental structuring, communication teaching strategies…"
              onChange={(e) => setDraft({ ...draft, observations: e.target.value })} /></div>
          <div className="field" style={{ maxWidth: 280 }}><label htmlFor="sn-read">Read by clinician (initials)</label>
            <input id="sn-read" className="input" value={draft.readBy} onChange={(e) => setDraft({ ...draft, readBy: e.target.value })} /></div>
          <div><button className="btn" onClick={save} disabled={!draft.observations.trim()}>Save meeting note</button></div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {notes.map((n, i) => (
          <div key={i} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: "var(--text-sm)" }}>Meeting note · {n.at.slice(0, 10)}</b>
              <span className={`pill ${n.readBy ? "good" : "warn"}`}>{n.readBy ? `Read by clinician (${n.readBy})` : "Awaiting clinician read"}</span>
            </div>
            {n.followUp ? <p className="sub" style={{ marginTop: 8 }}><b>Follow-up:</b> {n.followUp}</p> : null}
            <p className="sub" style={{ marginTop: 6 }}><b>Observations:</b> {n.observations}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionTreePanel({ clientId, goalId, pattern }: { clientId: number; goalId: string; pattern: string }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tree, setTree] = React.useState<ClinicalDecisionTree | null>(null);
  const [history, setHistory] = React.useState<{ date: string; summary: string; outcome: string | null }[]>([]);
  const [committedAs, setCommittedAs] = React.useState<string | null>(null);

  const load = async () => {
    setOpen(true); setBusy(true);
    try {
      const res = await fetch("/api/decision-tree", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, goalId, pattern }),
      });
      const data = await res.json();
      if (data.ok) { setTree(data.tree); setHistory(data.history ?? []); }
    } finally { setBusy(false); }
  };

  const commit = async (option: string, plan: string) => {
    await fetch("/api/decision-tree", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, goalId, pattern, commit: { decision: `${option}: ${plan}` } }),
    });
    setCommittedAs(option);
  };

  if (!open) {
    return (
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={load}>
        Open decision tree · {pattern}
      </button>
    );
  }
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      {busy ? <p className="sub">Building the decision tree…</p> : null}
      {history.length ? (
        <div className="card card-pad" style={{ background: "var(--accent-tint)", marginBottom: 10 }}>
          <p className="sub" style={{ fontWeight: 600 }}>Decision log for this goal (longitudinal memory):</p>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
            {history.map((h) => (
              <li key={`${h.date}-${h.summary}`}>{h.date}: {h.summary}{h.outcome ? ` — outcome: ${h.outcome}` : " — outcome not yet recorded"}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {tree ? (
        <>
          <p className="sub" style={{ fontWeight: 600 }}>Candidate causes <span className="sub">(AI inference — you decide)</span>:</p>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
            {tree.candidateCauses.map((c) => (
              <li key={c.cause}><b style={{ color: "var(--ink)" }}>{c.cause}</b> ({c.confidencePct}%) — {c.rationale}</li>
            ))}
          </ul>
          <p className="sub" style={{ fontWeight: 600, marginTop: 10 }}>Actions:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {tree.actions.map((a) => (
              <div key={a.option} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--text-sm)" }}><b>{a.option}</b> — <span style={{ color: "var(--muted)" }}>{a.plan}</span></span>
                {committedAs === a.option ? <span className="pill good">Committed</span> : committedAs ? null : (
                  <button className="btn secondary" onClick={() => commit(a.option, a.plan)}>Commit &amp; log decision</button>
                )}
              </div>
            ))}
          </div>
          <p className="trend" style={{ marginTop: 10 }}>Measurement plan: <b>{tree.measurementPlan}</b> · Escalation: {tree.escalation}</p>
        </>
      ) : !busy ? (
        <p className="sub">Decision support is unavailable; the pattern evidence and decision log above remain usable.</p>
      ) : null}
    </div>
  );
}
