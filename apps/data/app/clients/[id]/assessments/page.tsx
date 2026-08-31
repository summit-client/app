"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  administrations, bandFor, domainSummary, INSTRUMENTS, instrumentById, overallPct,
  saveAdministration, type Administration, type Instrument,
} from "@/lib/instruments";
import { PdfExport, PrintSection } from "@/components/pdf-export";

/**
 * Assessments — replaces the Excel assessment dashboards (ABLLS-R, AFLS,
 * ADL, MOTAS): administer an instrument, see the domain dashboard with the
 * same rating bands, and graph repeat administrations over time. Results are
 * provenance-tracked evidence for treatment planning. The structured caregiver
 * interview (Parent Interview questionnaire) also lives here.
 */
export default function AssessmentsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [administering, setAdministering] = React.useState<Instrument | null>(null);
  const [viewing, setViewing] = React.useState<Administration | null>(null);
  const [showInterview, setShowInterview] = React.useState(false);

  const done = administrations(clientId).sort((a, b) => b.date.localeCompare(a.date));

  if (administering) {
    return <AdministerView instrument={administering} clientId={clientId}
      onDone={() => { setAdministering(null); force(); }} />;
  }

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        Scores flow straight into the domain dashboard and the longitudinal view — no spreadsheet copies, no manual graphing.
        Results feed treatment-planning evidence, always labelled by instrument and date.
      </p>

      <h2 className="section-title">Instruments</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {INSTRUMENTS.map((ins) => {
          const past = done.filter((a) => a.instrumentId === ins.id);
          return (
            <div key={ins.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, maxWidth: "60ch" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{ins.name}</b>
                  <span className={`pill ${ins.kind === "in_house" ? "accent" : "neutral"}`}>
                    {ins.kind === "in_house" ? "in-house" : "licensed"}
                  </span>
                </div>
                <p className="sub">{ins.cadence}</p>
                {ins.kind === "licensed" && !ins.domains.some((d) => d.items.length) ? (
                  <p className="trend" style={{ marginTop: 4 }}>
                    Domain scaffolding only — item banks are entered by an administrator from your licensed protocol.
                  </p>
                ) : null}
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <button className="btn" onClick={() => setAdministering(ins)}>New administration</button>
                {past.length ? (
                  <p className="trend" style={{ marginTop: 8 }}>
                    {past.length} administration{past.length === 1 ? "" : "s"} · latest {past[0].date.slice(0, 10)} · {overallPct(ins, past[0])}% mastery
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {done.length ? (
        <>
          <h2 className="section-title">Administrations</h2>
          <div className="card table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Instrument</th><th scope="col">Date</th><th scope="col">% Mastery</th><th scope="col">Band</th><th scope="col">Sign-off</th><th aria-label="Open" /></tr></thead>
              <tbody>
                {done.map((a) => {
                  const ins = instrumentById(a.instrumentId)!;
                  const pct = overallPct(ins, a);
                  return (
                    <tr key={a.id}>
                      <td><b>{ins.shortName}</b></td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{a.date.slice(0, 10)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</td>
                      <td><span className={`pill ${pct >= 80 ? "good" : pct >= 50 ? "accent" : "warn"}`}>{bandFor(ins, pct)}</span></td>
                      <td>{a.supervisorSignoff ?? "—"}</td>
                      <td><button className="btn ghost" onClick={() => setViewing(viewing?.id === a.id ? null : a)}>{viewing?.id === a.id ? "Close" : "Dashboard"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {viewing ? <Dashboard a={viewing} all={done} /> : null}
        </>
      ) : null}

      <h2 className="section-title">Caregiver interview</h2>
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ maxWidth: "60ch" }}>
            <b>Parent Interview Assessment Questionnaire</b>
            <p className="sub">
              Background questions that inform the BAR and treatment planning. Refresh every 3 months — the automation
              reminds the assigned clinician. Answers are stored as caregiver report, never merged with measured data.
            </p>
          </div>
          <button className="btn secondary" onClick={() => setShowInterview((v) => !v)}>
            {showInterview ? "Close" : "Open interview"}
          </button>
        </div>
        {showInterview ? <ParentInterview clientId={clientId} /> : null}
      </div>
    </div>
  );
}

/* ---- administer ---------------------------------------------------------------- */

function AdministerView({ instrument, clientId, onDone }: {
  instrument: Instrument; clientId: number; onDone: () => void;
}) {
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState("");
  const [signoff, setSignoff] = React.useState("");
  const needsSignoff = instrument.id.startsWith("afls");

  const save = () => {
    saveAdministration({
      id: `asm-${Date.now().toString(36)}`,
      clientId, instrumentId: instrument.id,
      date: new Date().toISOString(),
      scores, notes,
      supervisorSignoff: signoff.trim() || null,
    });
    onDone();
  };

  return (
    <div>
      <button className="btn ghost" onClick={onDone}>← Back to assessments</button>
      <h2 className="section-title">{instrument.name}</h2>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>Rating scale</b>
        <p className="sub" style={{ marginTop: 4 }}>
          {instrument.scale.map((s) => `${s.value} = ${s.label}${s.description ? ` (${s.description})` : ""}`).join(" · ")}
        </p>
      </div>

      {instrument.domains.map((d) => (
        <div key={d.code} className="card card-pad" style={{ marginBottom: 10 }}>
          <b>{d.name}</b>
          {d.items.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {d.items.map((item, i) => {
                const key = `${d.code}:${i}`;
                return (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)", maxWidth: "48ch" }}>{d.code}{i + 1} · {item}</span>
                    <div style={{ display: "flex", gap: 4 }} role="group" aria-label={`Score for ${item}`}>
                      {instrument.scale.map((s) => (
                        <button key={s.value} className={`mode-tab ${scores[key] === s.value ? "active" : ""}`}
                          title={s.description ?? s.label} aria-pressed={scores[key] === s.value}
                          onClick={() => setScores((prev) => ({ ...prev, [key]: s.value }))}>
                          {instrument.maxPerItem <= 2 || instrument.id === "adl" || instrument.id === "motas" ? s.label : s.value}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <DomainQuickScore instrument={instrument} code={d.code} scores={scores} setScores={setScores} />
          )}
        </div>
      ))}

      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div className="field"><label htmlFor="asm-notes">Notes</label>
          <textarea id="asm-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {needsSignoff ? (
          <div className="field" style={{ maxWidth: 280 }}><label htmlFor="asm-sign">Supervisor sign-off &amp; initials</label>
            <input id="asm-sign" className="input" value={signoff} onChange={(e) => setSignoff(e.target.value)} placeholder="e.g. JS" /></div>
        ) : null}
        <div>
          <button className="btn lg" onClick={save} disabled={!Object.keys(scores).length || (needsSignoff && !signoff.trim())}>
            Save administration
          </button>
        </div>
      </div>
    </div>
  );
}

/** Licensed instruments without shipped item banks: score the domain as a whole
 * (0–max), standing in for the per-item bank until an admin enters it. */
function DomainQuickScore({ instrument, code, scores, setScores }: {
  instrument: Instrument; code: string;
  scores: Record<string, number>; setScores: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  const key = `${code}:0`;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <span className="sub" style={{ marginTop: 0 }}>Domain rating:</span>
      {instrument.scale.map((s) => (
        <button key={s.value} className={`mode-tab ${scores[key] === s.value ? "active" : ""}`}
          aria-pressed={scores[key] === s.value} title={s.description ?? s.label}
          onClick={() => setScores((prev) => ({ ...prev, [key]: s.value }))}>
          {s.label.length > 12 ? s.value : s.label}
        </button>
      ))}
    </div>
  );
}

/* ---- dashboard ------------------------------------------------------------------ */

function Dashboard({ a, all }: { a: Administration; all: Administration[] }) {
  const ins = instrumentById(a.instrumentId)!;
  const rows = domainSummary(ins, a).filter((r) => r.scored > 0);
  const series = all.filter((x) => x.instrumentId === a.instrumentId).sort((x, y) => x.date.localeCompare(y.date));

  return (
    <div className="card card-pad" style={{ marginTop: 12, borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>{ins.shortName} · {a.date.slice(0, 10)} — domain dashboard</b>
        <PdfExport title={ins.name} subtitle={`Administered ${a.date.slice(0, 10)} · overall ${overallPct(ins, a)}% mastery${a.supervisorSignoff ? ` · sign-off ${a.supervisorSignoff}` : ""}`}>
          <table>
            <thead><tr><th scope="col">Domain</th><th scope="col">Score</th><th scope="col">Max</th><th scope="col">%</th><th scope="col">Band</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.domain.code}>
                  <td>{r.domain.name}</td><td>{r.total}</td><td>{r.max}</td><td>{r.pct}%</td><td>{r.band}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {series.length > 1 ? (
            <PrintSection heading="Across administrations" text={series.map((s) => `${s.date.slice(0, 10)} — ${overallPct(ins, s)}%`).join(" → ")} />
          ) : null}
          {a.notes ? <PrintSection heading="Notes" text={a.notes} /> : null}
        </PdfExport>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.domain.code} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 220, fontSize: "var(--text-sm)", flex: "none" }}>{r.domain.name}</span>
            <div style={{ flex: 1, height: 12, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}
              role="img" aria-label={`${r.domain.name}: ${r.pct} percent`}>
              <div style={{ width: `${r.pct}%`, height: "100%", background: r.pct >= 80 ? "var(--good)" : r.pct >= 50 ? "var(--accent)" : "var(--warn)" }} />
            </div>
            <span className="trend" style={{ width: 130, flex: "none", textAlign: "right" }}>
              {r.total}/{r.max} · {r.pct}% · {r.band}
            </span>
          </div>
        ))}
      </div>
      {series.length > 1 ? (
        <p className="trend" style={{ marginTop: 12 }}>
          Across administrations: {series.map((s) => `${s.date.slice(0, 10)} — ${overallPct(ins, s)}%`).join(" → ")}
        </p>
      ) : (
        <p className="sub" style={{ marginTop: 12 }}>Repeat the administration next block to unlock the longitudinal view.</p>
      )}
      {a.notes ? <p className="sub" style={{ marginTop: 8 }}>Notes: {a.notes}</p> : null}
    </div>
  );
}

/* ---- parent interview ------------------------------------------------------------ */

const INTERVIEW_SECTIONS: { title: string; fields: string[] }[] = [
  { title: "School information", fields: ["Name of school", "Grade and classroom type", "Name of teacher", "Accommodations / modifications"] },
  { title: "Medical information", fields: ["Diagnosis", "Serious illness", "Hospital stays", "Dietary issues", "Sleep issues", "Allergies", "Medications", "Other"] },
  { title: "Biopsychosocial history", fields: ["Current living situation and family composition", "Relevant family history", "Birth history", "Applicable legal and social service issues"] },
  { title: "Independence", fields: ["Toileting", "Eating / drinking", "Changing clothes"] },
  { title: "Therapies (ABA, OT, Speech…)", fields: ["Type of therapy", "Duration", "Progress and providers"] },
];

function ParentInterview({ clientId }: { clientId: number }) {
  const KEY = `summit-parent-interview-${clientId}`;
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as { answers: Record<string, string>; at: string };
        setAnswers(d.answers); setSaved(d.at);
      }
    } catch { /* start clean */ }
  }, [KEY]);

  const save = () => {
    const at = new Date().toISOString();
    sessionStorage.setItem(KEY, JSON.stringify({ answers, at }));
    setSaved(at);
  };

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
      {saved ? <p className="trend">Last completed {saved.slice(0, 10)} — refresh due {new Date(new Date(saved).getTime() + 90 * 86_400_000).toISOString().slice(0, 10)}.</p> : null}
      {INTERVIEW_SECTIONS.map((s) => (
        <div key={s.title}>
          <h3 className="set-h">{s.title}</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {s.fields.map((f) => (
              <div className="field" key={f}>
                <label htmlFor={`pi-${f}`}>{f}</label>
                <textarea id={`pi-${f}`} className="input" rows={2} value={answers[f] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div>
        <button className="btn" onClick={save}>Save interview (caregiver report)</button>
      </div>
    </div>
  );
}
