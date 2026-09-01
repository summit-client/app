"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { urlFor } from "@summit/portals";
import { createNoteOnlySession, getMyClients } from "@/lib/data";
import { CaseloadCalendar } from "@/components/caseload-calendar";
import type { ClientRow } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  active: "good", intake: "accent", maintenance: "neutral", waitlist: "warn",
};

type View = "list" | "calendar";

/**
 * This clinician's own caseload, scoped server-side (getMyClients() filters
 * by client_sessions.clinician_id under RLS — see its doc comment in
 * lib/data.ts for why that's the relationship used and what it doesn't
 * cover yet). Not a client picker: there is no control anywhere on this
 * screen to browse clients outside this list.
 */
export default function CaseloadPage() {
  const router = useRouter();
  const [clients, setClients] = React.useState<ClientRow[]>([]);
  const [view, setView] = React.useState<View>("list");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [addingNoteFor, setAddingNoteFor] = React.useState<number | null>(null);
  const [noteError, setNoteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getMyClients()
      .then((cs) => { if (!cancelled) setClients(cs); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load your caseload."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Scheduler has no per-client filter it can be linked into (no URL param
  // it reads for one) — this opens its Sessions view, the closest existing
  // destination, not a pre-filtered one. See lib/data.ts's getMyClients()
  // doc comment and the PR description for the full reasoning.
  const scheduleHref = `${urlFor("scheduler")}/?view=sessions`;

  // A quick, independent way to reach the session-note form without going
  // through a calendar/schedule entry point — mints a note-only session
  // (status 'documentation', no data collection attached) and opens its
  // note form directly. For the common case of documenting a session that
  // already happened; the Sessions tab on the client record covers writing
  // a note against a specific existing session instead.
  const addNote = async (clientId: number) => {
    setAddingNoteFor(clientId);
    setNoteError(null);
    try {
      const session = await createNoteOnlySession(clientId);
      router.push(`/clients/${clientId}/sessions/${session.id}/note`);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Could not start a session note.");
      setAddingNoteFor(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page">My Caseload</h1>
          <p className="sub">
            {view === "list"
              ? "Clients you have documented at least one session with. Open a client, or jump straight to their goals, notes or schedule."
              : "Your own upcoming sessions, across every client on your caseload."}
          </p>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Caseload view">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v} role="tab" aria-selected={view === v}
              className={`mode-tab ${view === v ? "active" : ""}`}
              onClick={() => setView(v)}
            >
              {v === "list" ? "List" : "Calendar"}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--warn)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{loadError}</p>
        </div>
      ) : null}

      {noteError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{noteError}</p>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="card table-wrap" style={{ marginTop: 20 }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Goals</th>
                <th scope="col">Next session</th>
                <th scope="col">Status</th>
                <th aria-label="Quick links" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <b>{c.name}</b>
                    </Link>
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c.activeGoals} active · {c.masteredGoals} mastered
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.nextSession ?? "—"}</td>
                  <td><span className={`pill ${STATUS_PILL[c.status] ?? "neutral"}`}>{c.status}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        type="button" className="btn ghost" disabled={addingNoteFor === c.id}
                        onClick={() => void addNote(c.id)}
                      >
                        {addingNoteFor === c.id ? "Opening…" : "+ Note"}
                      </button>
                      <Link href={`/clients/${c.id}/goals`} className="btn ghost" style={{ textDecoration: "none" }}>
                        Goals
                      </Link>
                      <Link href={`/clients/${c.id}/sessions`} className="btn ghost" style={{ textDecoration: "none" }}>
                        Notes
                      </Link>
                      <a
                        href={scheduleHref} target="_blank" rel="noreferrer"
                        className="btn ghost" style={{ textDecoration: "none" }}
                        title="Opens the scheduler's Sessions view — not yet filterable to one client from here"
                      >
                        Schedule ↗
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !clients.length && !loadError ? (
                <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No clients yet — clients appear here once you've documented a session with them.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <CaseloadCalendar />
        </div>
      )}
    </div>
  );
}
