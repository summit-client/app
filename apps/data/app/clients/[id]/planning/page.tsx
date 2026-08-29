"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ClinicalEvidencePacket, TreatmentPlanSuggestions } from "@summit/clinical-ai";
import { getSetting } from "@summit/settings";

type Suggestion = TreatmentPlanSuggestions["suggestions"][number];

/**
 * Treatment Planning Copilot — the collaborative workspace. The clinician
 * builds the plan from assessment context, caregiver priorities, current and
 * mastered goals, Goal Bank progressions (provenance-first) and clearly
 * labelled AI alternatives. Committing records a clinical decision.
 */
export default function PlanningPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [busy, setBusy] = React.useState(false);
  const [packet, setPacket] = React.useState<ClinicalEvidencePacket | null>(null);
  const [bank, setBank] = React.useState<Suggestion[]>([]);
  const [ai, setAi] = React.useState<Suggestion[]>([]);
  const [committed, setCommitted] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/planning", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.ok) { setPacket(data.packet); setBank(data.goalBankSuggestions ?? []); setAi(data.aiSuggestions ?? []); }
      else setError(data.error ?? "Planning workspace failed to load.");
    } catch {
      setError("Planning workspace could not load. Your clinical data remains available.");
    } finally { setBusy(false); }
  }, [clientId]);

  React.useEffect(() => { void load(); }, [load]);

  const commit = async (s: Suggestion) => {
    await fetch("/api/planning", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, commit: { goalName: s.goalName, source: s.source, rationale: s.rationale, pattern: "treatment_planning" } }),
    });
    setCommitted((c) => [...c, s.goalName]);
  };

  const mastered = packet?.goals.filter((g) => g.masteryStatus === "mastered") ?? [];
  const active = packet?.goals.filter((g) => g.masteryStatus !== "mastered") ?? [];

  return (
    <div>
      <Link href={`/clients/${clientId}`} className="sub" style={{ color: "var(--accent)" }}>← Back to client</Link>
      <h1 className="h-page" style={{ marginTop: 8 }}>Treatment planning</h1>
      <p className="sub">
        Build the plan with evidence at hand — not from a blank page. Goal Bank progressions come first;
        AI alternatives are labelled as such. Every commitment is recorded as a clinical decision you own.
      </p>

      {error ? <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}><p className="sub" style={{ color: "var(--ink)" }}>{error}</p></div> : null}
      {busy && !packet ? <p className="sub" style={{ marginTop: 16 }}>Assembling the planning evidence…</p> : null}

      {packet ? (
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          {/* context: caregiver priorities + current goals */}
          <div className="card card-pad">
            <p className="sub" style={{ fontWeight: 600 }}>Caregiver priorities <span className="sub">(caregiver report)</span>:</p>
            {packet.caregiverTraining.reports.length ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
                {packet.caregiverTraining.reports.map((r) => <li key={r}>{r}</li>)}
              </ul>
            ) : <p className="sub">None on file for this period.</p>}
          </div>

          <div className="card card-pad">
            <p className="sub" style={{ fontWeight: 600 }}>Current goals ({active.length}) · mastered ({mastered.length}):</p>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
              {packet.goals.map((g) => (
                <li key={g.goalId}>
                  <b style={{ color: "var(--ink)" }}>{g.goalName}</b> — {g.masteryStatus.replace(/_/g, " ")}
                  {g.currentMeanPct != null ? `, current mean ${g.currentMeanPct}%` : ""}
                </li>
              ))}
            </ul>
          </div>

          {/* priority: Goal Bank first */}
          <div className="card card-pad">
            <span className="pill accent">Suggested from {getSetting("org.name")} Goal Bank</span>
            {bank.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {bank.map((s) => (
                  <SuggestionRow key={`b-${s.goalName}`} s={s} committed={committed.includes(s.goalName)} onCommit={() => commit(s)} />
                ))}
              </div>
            ) : <p className="sub" style={{ marginTop: 8 }}>No approved progressions apply yet — progressions unlock as goals near mastery.</p>}
          </div>

          {ai.length ? (
            <div className="card card-pad">
              <span className="pill warn">AI-generated alternatives</span>
              <p className="sub" style={{ marginTop: 6 }}>No approved Goal Bank source; review with extra care.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {ai.map((s) => (
                  <SuggestionRow key={`a-${s.goalName}`} s={s} committed={committed.includes(s.goalName)} onCommit={() => commit(s)} />
                ))}
              </div>
            </div>
          ) : null}

          <p className="sub">Packet {packet.packetId} · committing writes an auditable clinical decision under your name.</p>
        </div>
      ) : null}
    </div>
  );
}

function SuggestionRow({ s, committed, onCommit }: { s: Suggestion; committed: boolean; onCommit: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>{s.goalName}</b>
        <p className="sub">{s.rationale}</p>
      </div>
      {committed ? <span className="pill good">Committed to plan</span> : (
        <button className="btn secondary" onClick={onCommit}>Add to plan</button>
      )}
    </div>
  );
}
