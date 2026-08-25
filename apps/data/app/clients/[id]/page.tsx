"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getClients, getPrograms } from "@/lib/data";
import { masteryCheck, trendArrow } from "@/lib/mastery";
import { MODE_LABEL, PROMPT_ORDER, type ClientRow, type Program } from "@/lib/types";

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;

export default function ClientPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [client, setClient] = React.useState<ClientRow | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [showForm, setShowForm] = React.useState(false);

  React.useEffect(() => {
    void getClients().then((cs) => setClient(cs.find((c) => c.id === clientId) ?? null));
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  if (!client) return <p className="sub">Loading client…</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page">{client.name}</h1>
          <p className="sub">
            {client.age != null ? `Age ${client.age} · ` : ""}{client.serviceType ?? "Service"} · {client.funding ?? "Funding"} ·{" "}
            <span className="pill accent">{client.status}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={`/clients/${clientId}/planning`} className="btn secondary" style={{ textDecoration: "none" }}>
            Planning
          </a>
          <a href={`/clients/${clientId}/supervision`} className="btn secondary" style={{ textDecoration: "none" }}>
            Supervision
          </a>
          <a href={`/clients/${clientId}/report`} className="btn secondary" style={{ textDecoration: "none" }}>
            Progress report
          </a>
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "+ New goal"}
          </button>
        </div>
      </div>

      {showForm ? <NewGoalForm clientId={clientId} onSaved={(p) => { setPrograms((x) => [...x, p]); setShowForm(false); }} /> : null}

      <h2 className="section-title">Programs &amp; goals</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  {latest != null ? (
                    <>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 600, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                        {latest}{p.mode === "frequency" ? "/hr" : "%"}
                      </div>
                      <div className="trend">
                        last 5: <b>{p.last5.join(" → ")}</b> {ARROW[trendArrow(p.last5)]}
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
  const set = (k: string, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    const p: Program = {
      id: `p-${Date.now()}`, clientId, name: f.name, domain: f.domain,
      mode: f.mode as Program["mode"], operationalDefinition: f.operationalDefinition,
      masteryCriteria: `${f.masteryPct}% across 3 consecutive sessions, 2 settings, 2 people`,
      masteryPct: Number(f.masteryPct), masteryConsecutive: 3,
      promptLevel: f.promptLevel as Program["promptLevel"],
      reinforcementSchedule: f.reinforcementSchedule, sd: f.sd || null,
      targetDirection: f.targetDirection as Program["targetDirection"],
      status: "pending_signoff", intervalSeconds: 30, dailyTargetMinutes: null, steps: [], last5: [],
    };
    onSaved(p);
  };

  return (
    <div className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
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
        <button className="btn" onClick={save} disabled={!f.name.trim() || !f.operationalDefinition.trim()}>
          Save goal (pending supervisor sign-off)
        </button>
        <span className="sub">New goals activate once your supervisor signs off.</span>
      </div>
    </div>
  );
}
