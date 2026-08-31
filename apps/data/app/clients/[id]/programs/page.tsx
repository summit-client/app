"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { activateProgram, createProgram, getPrograms } from "@/lib/data";
import { masteryCheck, trendArrow } from "@/lib/mastery";
import { useIdentity } from "@/components/session-provider";
import { MODE_LABEL, PROMPT_ORDER, type Program } from "@/lib/types";

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;

/**
 * Programs tab — where supervisors create, configure, modify and version
 * clinical programming. Deliberately separate from Run Session, which only
 * selects and runs existing programming for today.
 */
export default function ProgramsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const identity = useIdentity();
  const canSignOff = identity.appRole === "admin" || identity.appRole === "supervisor";
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [activatingId, setActivatingId] = React.useState<string | null>(null);
  const [activateError, setActivateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  const activate = async (p: Program) => {
    setActivatingId(p.id);
    setActivateError(null);
    try {
      await activateProgram(p.id);
      setPrograms((x) => x.map((y) => (y.id === p.id ? { ...y, status: "active" } : y)));
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Could not activate this goal.");
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p className="sub" style={{ marginTop: 0 }}>
          Clinical programming configuration. Changes here are versioned and take effect for future sessions.
        </p>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "+ New goal"}
        </button>
      </div>

      {showForm ? <NewGoalForm clientId={clientId} onSaved={(p) => { setPrograms((x) => [...x, p]); setShowForm(false); }} /> : null}

      {activateError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 14, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{activateError}</p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {programs.map((p) => {
          const mc = masteryCheck(p, null);
          const latest = p.last5.at(-1);
          return (
            <div key={p.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{p.name}</b>
                    <span className="pill accent">{MODE_LABEL[p.mode]}</span>
                    <span className={`pill ${p.status === "mastered" ? "good" : p.status === "active" ? "neutral" : "warn"}`}>{p.status}</span>
                    {mc.met ? <span className="pill good">Criterion met — confirm settings/people</span> : null}
                  </div>
                  <p className="sub" style={{ maxWidth: "62ch" }}>{p.operationalDefinition}</p>
                  <p className="trend" style={{ marginTop: 8 }}>
                    Prompt: <b>{p.promptLevel}</b> · Schedule: <b>{p.reinforcementSchedule}</b> · Mastery: {p.masteryCriteria}
                  </p>
                  {p.targets.length ? (
                    <p className="trend" style={{ marginTop: 4 }}>
                      Targets: {p.targets.join(" · ")}
                    </p>
                  ) : null}
                  {p.status === "pending_signoff" && canSignOff ? (
                    <button
                      className="btn secondary" style={{ marginTop: 10 }}
                      disabled={activatingId === p.id}
                      onClick={() => activate(p)}
                    >
                      {activatingId === p.id ? "Activating…" : "Activate goal (sign off)"}
                    </button>
                  ) : null}
                  {p.status === "pending_signoff" && !canSignOff ? (
                    <p className="sub" style={{ marginTop: 8 }}>Awaiting your supervisor&rsquo;s sign-off.</p>
                  ) : null}
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  {latest != null ? (
                    <>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 600, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                        {latest}{p.mode === "frequency" ? "/hr" : "%"}
                      </div>
                      <div className="trend">
                        last 5: <b>{p.last5.slice(-5).join(" → ")}</b> {ARROW[trendArrow(p.last5)]}
                      </div>
                    </>
                  ) : (
                    <span className="pill neutral">No data yet</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!programs.length ? <p className="sub">No programs yet — add the first goal.</p> : null}
      </div>
    </div>
  );
}

function NewGoalForm({ clientId, onSaved }: { clientId: number; onSaved: (p: Program) => void }) {
  const [f, setF] = React.useState({
    name: "", domain: "Expressive communication", mode: "dtt", operationalDefinition: "",
    promptLevel: "verbal", reinforcementSchedule: "FR1", sd: "",
    masteryPct: 80, targetDirection: "increase",
  });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const set = (k: string, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const p = await createProgram({
        clientId, name: f.name, domain: f.domain,
        mode: f.mode as Program["mode"], operationalDefinition: f.operationalDefinition,
        masteryPct: Number(f.masteryPct), promptLevel: f.promptLevel as Program["promptLevel"],
        reinforcementSchedule: f.reinforcementSchedule, sd: f.sd || null,
        targetDirection: f.targetDirection as Program["targetDirection"],
      });
      onSaved(p);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save this goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card card-pad two-col-grid" style={{ marginTop: 16 }}>
      {saveError ? (
        <p className="sub" role="alert" style={{ gridColumn: "1 / -1", color: "var(--danger)" }}>{saveError}</p>
      ) : null}
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="g-name">Goal name</label>
        <input id="g-name" className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Mand for break" />
      </div>
      <div className="field">
        <label htmlFor="g-mode">Measurement mode</label>
        <select id="g-mode" className="input" value={f.mode} onChange={(e) => set("mode", e.target.value)}>
          {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="g-prompt">Current prompt level</label>
        <select id="g-prompt" className="input" value={f.promptLevel} onChange={(e) => set("promptLevel", e.target.value)}>
          {PROMPT_ORDER.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="g-def">Operational definition</label>
        <textarea id="g-def" className="input" value={f.operationalDefinition} onChange={(e) => set("operationalDefinition", e.target.value)} placeholder="Observable, measurable description of the target behaviour…" />
      </div>
      <div className="field">
        <label htmlFor="g-sd">SD (if DTT)</label>
        <input id="g-sd" className="input" value={f.sd} onChange={(e) => set("sd", e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="g-sched">Reinforcement schedule</label>
        <input id="g-sched" className="input" value={f.reinforcementSchedule} onChange={(e) => set("reinforcementSchedule", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" onClick={save} disabled={saving || !f.name.trim() || !f.operationalDefinition.trim()}>
          {saving ? "Saving…" : "Save goal (pending supervisor sign-off)"}
        </button>
        <span className="sub">New goals activate once your supervisor signs off.</span>
      </div>
    </div>
  );
}
