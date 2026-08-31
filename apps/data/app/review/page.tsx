"use client";

import * as React from "react";
import { countersignNote, getPendingCountersigns } from "@/lib/data";
import { useIdentity } from "@/components/session-provider";
import type { PendingCountersign } from "@/lib/types";

/**
 * Supervisor review queue — session notes awaiting countersign, clinic-wide.
 * Mirrors the MEGBA approval-queue pattern: approve (countersign) or return
 * with a note.
 *
 * The portal-level gate (SessionGate, layout.tsx) admits admin, supervisor
 * AND clinician — it only checks "may this person use the clinician
 * portal at all," not "is this person allowed to countersign." Without the
 * check below, any clinician account could open this screen and countersign
 * their own (or a colleague's) session note, which defeats the whole point
 * of a supervisor countersignature.
 *
 * This is a UI-layer mitigation only, not the authoritative fix: the
 * underlying `session_notes`/`client_sessions` RLS UPDATE policies
 * (`clinic_id = auth_clinic_id() and auth_is_staff()`, migration 0001) admit
 * clinician, supervisor and admin identically, so a clinician account could
 * still call the same Supabase update directly (devtools, a script) and
 * have it succeed under RLS. That needs a migration — out of scope for this
 * app-only branch — and is logged in BLOCKED-data.md.
 *
 * This queue reads real, clinic-wide data via `getPendingCountersigns()` —
 * previously `pendingNotes()` only ever read this same browser's own local
 * mirror, so a supervisor's queue was empty unless they personally happened
 * to be the browser that wrote the note.
 */
export default function ReviewQueuePage() {
  const identity = useIdentity();
  const [notes, setNotes] = React.useState<PendingCountersign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [returnText, setReturnText] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getPendingCountersigns()
      .then(setNotes)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the review queue."))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(refresh, [refresh]);

  const act = async (item: PendingCountersign, decision: "countersigned" | "returned") => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await countersignNote(item, decision, decision === "returned" ? returnText[item.id] : undefined);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Could not ${decision === "countersigned" ? "countersign" : "return"} this note.`);
    } finally {
      setBusyId(null);
    }
  };

  if (identity.appRole === "clinician") {
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">Review Queue is not for your role</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          Countersigning is a supervisor/admin action. Your own session notes will appear here
          for your supervisor once submitted — see them under the client&rsquo;s Sessions tab.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="h-page">Review Queue</h1>
      <p className="sub">Session notes from your clinic, awaiting countersign.</p>

      {loadError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{loadError}</p>
          <button className="btn secondary" style={{ marginTop: 8 }} onClick={refresh}>Try again</button>
        </div>
      ) : null}
      {actionError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{actionError}</p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {loading ? <p className="sub">Loading the review queue…</p> : null}
        {!loading && !loadError ? notes.map((item) => {
          const n = item.note;
          const busy = busyId === item.id;
          return (
            <div key={item.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <b>{item.clientName} · code {n.billableCode}</b>
                <span className="pill warn">Awaiting countersign</span>
              </div>
              <p className="sub" style={{ marginTop: 4 }}>
                Written by <b>{item.clinicianName}</b> · {new Date(item.createdAt).toLocaleString()}
              </p>
              {n.subjective ? <p className="sub" style={{ marginTop: 8 }}><b>S:</b> {n.subjective}</p> : null}
              <p className="sub" style={{ marginTop: 8 }}><b>O:</b> {n.objective}</p>
              {n.perProgram.map((p) => (
                <p key={p.programName} className="sub" style={{ marginTop: 6 }}>· {p.narrative}</p>
              ))}
              {n.abcNarrative ? <p className="sub" style={{ marginTop: 6, color: "var(--warn)" }}>{n.abcNarrative}</p> : null}
              <p className="sub" style={{ marginTop: 6 }}><b>A:</b> {n.assessment}</p>
              <p className="sub" style={{ marginTop: 6 }}><b>P:</b> {n.plan}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn" disabled={busy} onClick={() => act(item, "countersigned")}>
                  {busy ? "Working…" : "Countersign"}
                </button>
                <input
                  className="input" style={{ maxWidth: 320 }} placeholder="Return note (what to fix)…"
                  aria-label={`Return note for ${item.clientName}'s session (what to fix)`}
                  value={returnText[item.id] ?? ""}
                  onChange={(e) => setReturnText({ ...returnText, [item.id]: e.target.value })}
                />
                <button
                  className="btn secondary" disabled={busy || !returnText[item.id]}
                  onClick={() => act(item, "returned")}
                >
                  Return to clinician
                </button>
              </div>
            </div>
          );
        }) : null}
        {!loading && !loadError && !notes.length ? (
          <div className="card card-pad"><p className="sub">Nothing waiting. Signed notes from your team will appear here.</p></div>
        ) : null}
      </div>
    </div>
  );
}
