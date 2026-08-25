"use client";

import * as React from "react";
import { lockRunSession, pendingNotes, saveNote } from "@/lib/data";
import type { SessionNoteDraft } from "@/lib/types";

/**
 * Supervisor review queue — session notes awaiting countersign. Mirrors the
 * MEGBA approval-queue pattern: approve (countersign) or return with a note.
 * Role-gated in live mode by RLS + the profiles.role check.
 */
export default function ReviewQueuePage() {
  const [notes, setNotes] = React.useState<SessionNoteDraft[]>([]);
  const [returnText, setReturnText] = React.useState<Record<number, string>>({});
  const refresh = () => setNotes([...pendingNotes()]);
  React.useEffect(refresh, []);

  const act = async (n: SessionNoteDraft, decision: "countersigned" | "returned") => {
    await saveNote({ ...n, status: decision });
    if (decision === "countersigned") await lockRunSession(n.sessionId); // completed → locked
    refresh();
  };

  return (
    <div>
      <h1 className="h-page">Review Queue</h1>
      <p className="sub">Session notes from your supervised clinicians, awaiting countersign.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {notes.map((n) => (
          <div key={n.sessionId} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>Session #{n.sessionId} · code {n.billableCode}</b>
              <span className="pill warn">Awaiting countersign</span>
            </div>
            {n.subjective ? <p className="sub" style={{ marginTop: 8 }}><b>S:</b> {n.subjective}</p> : null}
            <p className="sub" style={{ marginTop: 8 }}><b>O:</b> {n.objective}</p>
            {n.perProgram.map((p) => (
              <p key={p.programName} className="sub" style={{ marginTop: 6 }}>· {p.narrative}</p>
            ))}
            {n.abcNarrative ? <p className="sub" style={{ marginTop: 6, color: "var(--warn)" }}>{n.abcNarrative}</p> : null}
            <p className="sub" style={{ marginTop: 6 }}><b>A:</b> {n.assessment}</p>
            <p className="sub" style={{ marginTop: 6 }}><b>P:</b> {n.plan}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" onClick={() => act(n, "countersigned")}>Countersign</button>
              <input
                className="input" style={{ maxWidth: 320 }} placeholder="Return note (what to fix)…"
                value={returnText[n.sessionId] ?? ""}
                onChange={(e) => setReturnText({ ...returnText, [n.sessionId]: e.target.value })}
              />
              <button className="btn secondary" onClick={() => act(n, "returned")} disabled={!returnText[n.sessionId]}>
                Return to clinician
              </button>
            </div>
          </div>
        ))}
        {!notes.length ? (
          <div className="card card-pad"><p className="sub">Nothing waiting. Signed notes from your team will appear here.</p></div>
        ) : null}
      </div>
    </div>
  );
}
