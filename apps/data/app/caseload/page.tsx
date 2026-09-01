"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNoteOnlySession, getClients } from "@/lib/data";
import type { ClientRow } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  active: "good", intake: "accent", maintenance: "neutral", waitlist: "warn",
};

export default function CaseloadPage() {
  const router = useRouter();
  const [clients, setClients] = React.useState<ClientRow[]>([]);
  const [addingNoteFor, setAddingNoteFor] = React.useState<number | null>(null);
  const [noteError, setNoteError] = React.useState<string | null>(null);
  React.useEffect(() => { void getClients().then(setClients); }, []);

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
      <h1 className="h-page">My Caseload</h1>
      <p className="sub">Open a client to manage goals and review progress.</p>
      {noteError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{noteError}</p>
        </div>
      ) : null}

      <div className="card table-wrap" style={{ marginTop: 20 }}>
        <table className="data">
          <thead>
            <tr><th scope="col">Client</th><th scope="col">Age</th><th scope="col">Funding</th><th scope="col">Service</th><th scope="col">Goals</th><th scope="col">Status</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td>{c.age ?? "-"}</td>
                <td>{c.funding ?? "-"}</td>
                <td>{c.serviceType ?? "-"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {c.activeGoals} active · {c.masteredGoals} mastered
                </td>
                <td><span className={`pill ${STATUS_PILL[c.status] ?? "neutral"}`}>{c.status}</span></td>
                <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button" className="btn ghost" disabled={addingNoteFor === c.id}
                    onClick={() => void addNote(c.id)}
                  >
                    {addingNoteFor === c.id ? "Opening…" : "+ Note"}
                  </button>
                  <Link href={`/clients/${c.id}`} className="btn ghost" style={{ textDecoration: "none" }}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
