"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  completeNoteOnlySession, getClients, getNote, getPrograms, getRunSession,
  hydrateClientHistory, saveNote,
} from "@/lib/data";
import { PdfExport, PrintSection } from "@/components/pdf-export";
import type { ClientRow, Program, RunSession, SessionNoteDraft } from "@/lib/types";

/**
 * Session-note entry — a standalone SOAP form tied to one `client_sessions`
 * row, independent of the live Plan → Session Tab → Documentation flow in
 * `run/page.tsx`. That flow drafts the O section from a session's own
 * atomic observations and only ever reaches its note editor after data
 * collection; this page exists for the same underlying `session_notes` row
 * but reachable directly — from the Sessions tab (an existing session with
 * no note yet, or a draft/returned one to finish) or from the caseload
 * roster (`createNoteOnlySession` mints the session first, see
 * `app/caseload/page.tsx`) — so a clinician can document a session without
 * being blocked on that live-collection UI.
 *
 * Feeds the exact same `session_notes` table and status machine
 * (draft → awaiting_countersign → countersigned | returned) that
 * `run/page.tsx`'s note editor and the supervisor Review Queue
 * (`app/review/page.tsx`) already use, which is what the client portal's
 * "Updates" screen reads under RLS (migration 0020: only 'signed' or
 * 'countersigned' rows, never a draft or one awaiting countersign).
 */
export default function SessionNotePage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const clientId = Number(params.id);
  const sessionId = Number(params.sessionId);

  const [client, setClient] = React.useState<ClientRow | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [session, setSession] = React.useState<RunSession | null | undefined>(undefined); // undefined = still loading
  const [note, setNote] = React.useState<SessionNoteDraft | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"draft" | "sign" | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [justSigned, setJustSigned] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getClients(), getPrograms(clientId), hydrateClientHistory(clientId)])
      .then(([clients, progs]) => {
        if (cancelled) return;
        setClient(clients.find((c) => c.id === clientId) ?? null);
        setPrograms(progs);
        setSession(getRunSession(sessionId) ?? null);
        const existing = getNote(sessionId);
        setNote(existing ?? blankNote(sessionId, clientId));
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load this session."); });
    return () => { cancelled = true; };
  }, [clientId, sessionId]);

  if (loadError) {
    return (
      <div className="card card-pad" role="alert" style={{ borderLeft: "3px solid var(--danger)" }}>
        <p className="sub" style={{ color: "var(--ink)" }}>{loadError}</p>
      </div>
    );
  }
  if (session === undefined || !client) return <p className="sub">Loading…</p>;
  if (session === null || session.clientId !== clientId) {
    return (
      <div className="card card-pad">
        <p className="sub">This session couldn&rsquo;t be found on {client.name}&rsquo;s record.</p>
        <Link href={`/clients/${clientId}/sessions`} className="btn secondary" style={{ textDecoration: "none", marginTop: 10, display: "inline-block" }}>
          Back to session history
        </Link>
      </div>
    );
  }
  if (!note) return <p className="sub">Loading…</p>;

  const readOnly = note.status === "awaiting_countersign" || note.status === "countersigned" || note.status === "signed";
  const dateLabel = (session.endTime ?? session.startTime ?? session.createdAt).slice(0, 10);

  const addProgramNote = (programName: string) => {
    if (!programName || note.perProgram.some((p) => p.programName === programName)) return;
    setNote({ ...note, perProgram: [...note.perProgram, { programName, narrative: "" }] });
  };
  const removeProgramNote = (programName: string) => {
    setNote({ ...note, perProgram: note.perProgram.filter((p) => p.programName !== programName) });
  };

  const save = async (mode: "draft" | "sign") => {
    setBusy(mode);
    setSaveError(null);
    try {
      const status: SessionNoteDraft["status"] = mode === "sign" ? "awaiting_countersign" : "draft";
      await saveNote({ ...note, status });
      if (mode === "sign") {
        await completeNoteOnlySession(sessionId);
        setJustSigned(true);
      } else {
        setNote({ ...note, status });
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : `Could not ${mode === "sign" ? "sign" : "save"} this note.`);
    } finally {
      setBusy(null);
    }
  };

  if (justSigned || readOnly) {
    return (
      <div>
        {justSigned ? (
          <div className="card card-pad" role="status" style={{ marginBottom: 14 }}>
            <b>Note signed and submitted for countersign.</b>
            <p className="sub" style={{ marginTop: 8 }}>
              It&rsquo;s now in your supervisor&rsquo;s Review Queue. Once countersigned, this session locks and the family can see it
              in their Updates screen.
            </p>
          </div>
        ) : null}
        <NoteReadOnly client={client} session={session} note={note} dateLabel={dateLabel} />
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <Link href={`/clients/${clientId}/sessions`} className="btn secondary" style={{ textDecoration: "none" }}>
            Back to session history
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Session note — {client.name}</h2>
          <span className={`pill ${note.status === "returned" ? "warn" : "neutral"}`}>
            {note.status === "returned" ? "Returned — needs changes" : "Draft"}
          </span>
        </div>
        <p className="sub">
          Session #{session.id} · {dateLabel} · {session.serviceType ?? "Session"}{session.location ? ` at ${session.location}` : ""}
        </p>
      </div>

      {note.status === "returned" && note.returnNote ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 14, borderLeft: "3px solid var(--warn)" }}>
          <b>Your supervisor returned this note.</b>
          <p className="sub" style={{ marginTop: 6, color: "var(--ink)" }}>{note.returnNote}</p>
        </div>
      ) : null}

      <div className="card card-pad" style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <div className="field">
          <label htmlFor="n-s">S — Subjective (context, caregiver report)</label>
          <textarea id="n-s" className="input" value={note.subjective} placeholder="Caregiver reported…, client arrived…"
            onChange={(e) => setNote({ ...note, subjective: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="n-o">O — Objective</label>
          <textarea id="n-o" className="input" value={note.objective} placeholder="What happened during the session…"
            onChange={(e) => setNote({ ...note, objective: e.target.value })} />
        </div>

        {note.perProgram.map((p) => (
          <div className="field" key={p.programName}>
            <label htmlFor={`n-p-${p.programName}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{p.programName}</span>
              <button type="button" className="chip-x" aria-label={`Remove ${p.programName} note`} onClick={() => removeProgramNote(p.programName)}>×</button>
            </label>
            <textarea id={`n-p-${p.programName}`} className="input" value={p.narrative}
              onChange={(e) => {
                const per = note.perProgram.map((x) => x.programName === p.programName ? { ...x, narrative: e.target.value } : x);
                setNote({ ...note, perProgram: per });
              }} />
          </div>
        ))}
        {programs.length ? (
          <div className="field">
            <label htmlFor="n-addprog">Add a per-goal note (optional)</label>
            <select id="n-addprog" className="input" style={{ width: "auto" }} value=""
              onChange={(e) => addProgramNote(e.target.value)}>
              <option value="">+ add goal…</option>
              {programs
                .filter((p) => !note.perProgram.some((x) => x.programName === p.name))
                .map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="n-abc">Behaviour incidents (ABC), if any</label>
          <textarea id="n-abc" className="input" value={note.abcNarrative}
            onChange={(e) => setNote({ ...note, abcNarrative: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="n-a">A — Assessment</label>
          <textarea id="n-a" className="input" value={note.assessment}
            onChange={(e) => setNote({ ...note, assessment: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="n-pl">P — Plan</label>
          <textarea id="n-pl" className="input" value={note.plan}
            onChange={(e) => setNote({ ...note, plan: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="n-code">Billable service code</label>
          <select id="n-code" className="input" value={note.billableCode}
            onChange={(e) => setNote({ ...note, billableCode: e.target.value as SessionNoteDraft["billableCode"] })}>
            <option value="97153">97153 · Direct treatment by technician</option>
            <option value="97155">97155 · Protocol modification</option>
            <option value="97156">97156 · Family guidance</option>
          </select>
        </div>

        {saveError ? (
          <p className="sub" role="alert" style={{ color: "var(--danger)" }}>{saveError}</p>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn lg" disabled={busy !== null} onClick={() => void save("sign")}>
            {busy === "sign" ? "Signing…" : "Sign & submit for countersign"}
          </button>
          <button className="btn secondary" disabled={busy !== null} onClick={() => void save("draft")}>
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button className="btn ghost" type="button" onClick={() => router.push(`/clients/${clientId}/sessions`)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function blankNote(sessionId: number, clientId: number): SessionNoteDraft {
  return {
    sessionId, clientId, subjective: "", objective: "", assessment: "", plan: "",
    perProgram: [], abcNarrative: "", billableCode: "97153", status: "draft",
  };
}

function NoteReadOnly({ client, session, note, dateLabel }: {
  client: ClientRow; session: RunSession; note: SessionNoteDraft; dateLabel: string;
}) {
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Session note — {client.name}</h2>
        <span className={`pill ${note.status === "countersigned" ? "good" : "warn"}`}>
          {note.status === "countersigned" ? "Countersigned" : "Awaiting countersign"}
        </span>
      </div>
      <p className="sub">
        Session #{session.id} · {dateLabel} · {session.serviceType ?? "Session"} · code {note.billableCode}
      </p>
      <div style={{ marginTop: 10 }}>
        {note.subjective ? <p className="sub" style={{ marginTop: 8 }}><b>S:</b> {note.subjective}</p> : null}
        <p className="sub" style={{ marginTop: 8 }}><b>O:</b> {note.objective}</p>
        {note.perProgram.map((p) => <p key={p.programName} className="sub" style={{ marginTop: 6 }}>· <b>{p.programName}:</b> {p.narrative}</p>)}
        {note.abcNarrative ? <p className="sub" style={{ marginTop: 6, color: "var(--warn)" }}>{note.abcNarrative}</p> : null}
        <p className="sub" style={{ marginTop: 6 }}><b>A:</b> {note.assessment}</p>
        <p className="sub" style={{ marginTop: 6 }}><b>P:</b> {note.plan}</p>
      </div>
      <div style={{ marginTop: 12 }}>
        <PdfExport title="Session Note (SOAP)" subtitle={`Session #${session.id} · ${dateLabel} · code ${note.billableCode} · ${note.status.replace(/_/g, " ")}`}>
          <PrintSection heading="S — Subjective" text={note.subjective || "—"} />
          <PrintSection heading="O — Objective" text={note.objective} />
          {note.perProgram.map((p) => <PrintSection key={p.programName} heading={p.programName} text={p.narrative} />)}
          {note.abcNarrative ? <PrintSection heading="Behaviour incidents (ABC)" text={note.abcNarrative} /> : null}
          <PrintSection heading="A — Assessment" text={note.assessment} />
          <PrintSection heading="P — Plan" text={note.plan} />
        </PdfExport>
      </div>
    </div>
  );
}
