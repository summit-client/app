"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { eventsFor, getPrograms, getSession, incidentsFor, saveNote } from "@/lib/data";
import { sessionPercent } from "@/lib/mastery";
import { FUNCTION_LABEL, type Program, type ScheduledSession, type SessionNoteDraft } from "@/lib/types";

export default function SessionNotePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = Number(params.id);
  const [session, setSession] = React.useState<ScheduledSession | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [note, setNote] = React.useState<SessionNoteDraft | null>(null);
  const [signed, setSigned] = React.useState(false);

  React.useEffect(() => {
    void getSession(sessionId).then(async (s) => {
      setSession(s);
      if (!s) return;
      const ps = await getPrograms(s.clientId);
      setPrograms(ps);
      // Draft prefilled from the session's own collected data — the clinician edits, then signs.
      const perProgram = ps
        .map((p) => {
          const ev = eventsFor(p.id);
          if (!ev.length) return null;
          const pct = sessionPercent(p, ev);
          return {
            programName: p.name,
            narrative: pct != null
              ? `${p.name}: ${pct}% this session across ${ev.length} recorded observations. Prompt level ${p.promptLevel}, schedule ${p.reinforcementSchedule}.`
              : `${p.name}: ${ev.length} observations recorded this session.`,
          };
        })
        .filter((x): x is { programName: string; narrative: string } => x !== null);
      const incidents = incidentsFor(s.clientId);
      setNote({
        sessionId,
        summary: `${s.type} with ${s.clientName} at ${s.location}. ${perProgram.length} program${perProgram.length === 1 ? "" : "s"} run, ${incidents.length} behaviour incident${incidents.length === 1 ? "" : "s"}.`,
        perProgram,
        abcNarrative: incidents
          .map((i) => `Incident at ${new Date(i.occurredAt).toLocaleTimeString()}: ${i.behaviour}. Antecedent: ${i.antecedent}. Consequence: ${i.consequence}. Suspected function: ${i.suspectedFunction ? FUNCTION_LABEL[i.suspectedFunction] : "not identified"}.`)
          .join("\n"),
        familyUpdate: "",
        planNext: "",
        billableCode: "97153",
        status: "draft",
      });
    });
  }, [sessionId]);

  if (!session || !note) return <p className="sub">Assembling the note from this session&rsquo;s data…</p>;

  const patch = (k: keyof SessionNoteDraft, v: unknown) => setNote({ ...note, [k]: v } as SessionNoteDraft);

  const sign = async () => {
    const final: SessionNoteDraft = { ...note, status: "awaiting_countersign" };
    await saveNote(final);
    setSigned(true);
    setTimeout(() => router.push("/"), 1600);
  };

  if (signed) {
    return (
      <div className="card card-pad" role="status">
        <b>Note signed and sent for countersign.</b>
        <p className="sub">Your supervisor will review it in the queue. Once signed, changes require an amendment record.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href={`/session/${sessionId}`} className="sub" style={{ color: "var(--accent)" }}>← Back to session</Link>
      <h1 className="h-page" style={{ marginTop: 8 }}>Session note · {session.clientName}</h1>
      <p className="sub">Drafted from this session&rsquo;s data. Edit anything, then sign &amp; submit.</p>

      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        <div className="field"><label htmlFor="n-sum">Session summary</label>
          <textarea id="n-sum" className="input" value={note.summary} onChange={(e) => patch("summary", e.target.value)} /></div>
        {note.perProgram.map((p, i) => (
          <div className="field" key={p.programName}>
            <label htmlFor={`n-p${i}`}>{p.programName}</label>
            <textarea id={`n-p${i}`} className="input" value={p.narrative}
              onChange={(e) => {
                const per = [...note.perProgram]; per[i] = { ...per[i], narrative: e.target.value };
                patch("perProgram", per);
              }} />
          </div>
        ))}
        {note.abcNarrative ? (
          <div className="field"><label htmlFor="n-abc">Behaviour incidents (ABC)</label>
            <textarea id="n-abc" className="input" value={note.abcNarrative} onChange={(e) => patch("abcNarrative", e.target.value)} /></div>
        ) : null}
        <div className="field"><label htmlFor="n-fam">Family update (plain language)</label>
          <textarea id="n-fam" className="input" value={note.familyUpdate} onChange={(e) => patch("familyUpdate", e.target.value)}
            placeholder="What the family should hear about today…" /></div>
        <div className="field"><label htmlFor="n-plan">Plan for next session</label>
          <textarea id="n-plan" className="input" value={note.planNext} onChange={(e) => patch("planNext", e.target.value)} /></div>
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="n-code">Billable service code</label>
          <select id="n-code" className="input" value={note.billableCode} onChange={(e) => patch("billableCode", e.target.value)}>
            <option value="97153">97153 · Direct treatment by technician</option>
            <option value="97155">97155 · Protocol modification</option>
            <option value="97156">97156 · Family guidance</option>
          </select>
        </div>
        <div className="card card-pad" style={{ background: "var(--accent-tint)", border: "1px solid var(--line)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>
            Session notes are CPBAO-mandatory and PHIPA-protected. Once signed, edits require an amendment record.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn lg" onClick={sign}>Sign &amp; submit for countersign</button>
          <button className="btn secondary" onClick={() => saveNote(note)}>Save draft</button>
        </div>
      </div>
    </div>
  );
}
