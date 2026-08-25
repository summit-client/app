"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  completeRunSession, createRunSession, currentTarget, endRunSession, eventsFor, eventsForSession,
  getClients, getPrograms, incidentsFor, openSessionFor, runSessionsFor, saveNote, saveSessionPlan,
  setActiveSession, setActivityContext, setCurrentTarget, startRunSession, summariesFor,
} from "@/lib/data";
import {
  AbcPanel, DttPanel, DurationPanel, FrequencyPanel, IntervalPanel, NetPanel, TaskAnalysisPanel, YniPanel,
} from "@/components/modes";
import { masteryCheck, trendArrow } from "@/lib/mastery";
import {
  MODE_LABEL, PROMPT_ORDER,
  type ClientRow, type Program, type RunSession, type SessionNoteDraft, type SessionPlanDraft,
} from "@/lib/types";

/**
 * Run Session — lives inside the client record and is bound to it for life.
 * planning → active → documentation → completed → locked. Every tap during
 * the active stage writes an atomic observation; everything downstream
 * (session metrics, graphs, mastery, Clinical Signals, the SOAP note) derives
 * from those observations automatically.
 */

const ACTIVITIES = ["Arrival / pairing", "Structured teaching", "Play", "Snack", "Transition", "Community outing"];
const LOCATIONS = ["Clinic", "Home", "School", "Community", "Virtual"];
const DURATIONS = [60, 90, 120, 180];

export default function RunSessionPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [client, setClient] = React.useState<ClientRow | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    void getClients().then((cs) => setClient(cs.find((c) => c.id === clientId) ?? null));
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  const session = openSessionFor(clientId);
  const lastDone = runSessionsFor(clientId).find((s) => s.status === "completed" || s.status === "locked");

  if (!client) return <p className="sub">Loading client…</p>;

  if (!session) return <PlanStage client={client} programs={programs} lastDone={lastDone} onChange={force} />;
  if (session.status === "planning") return <PlanStage client={client} programs={programs} session={session} lastDone={lastDone} onChange={force} />;
  if (session.status === "active") return <SessionTab client={client} programs={programs} session={session} onChange={force} />;
  return <DocumentationStage client={client} programs={programs} session={session} onChange={force} />;
}

/* ---- STEP 1 · Plan this session -------------------------------------------- */

function PlanStage({ client, programs, session, lastDone, onChange }: {
  client: ClientRow; programs: Program[]; session?: RunSession; lastDone?: RunSession; onChange: () => void;
}) {
  const [duration, setDuration] = React.useState(session?.plannedDurationMin ?? 120);
  const [location, setLocation] = React.useState(session?.location ?? "Clinic");
  const [serviceType, setServiceType] = React.useState(session?.serviceType ?? "Direct Therapy");
  const [focus, setFocus] = React.useState(session?.focus ?? "");
  const [busy, setBusy] = React.useState(false);
  const [planError, setPlanError] = React.useState<string | null>(null);

  const runnable = programs.filter((p) => p.status === "active" || p.status === "maintenance");

  const ensureSession = async (): Promise<RunSession> => {
    if (session) return session;
    return createRunSession(client.id, { plannedDurationMin: duration, location, serviceType, focus: focus || null }, programs);
  };

  const suggest = async () => {
    setBusy(true); setPlanError(null);
    try {
      const s = await ensureSession();
      const goals = runnable.map((p) => {
        const mc = masteryCheck(p, null);
        const flag = mc.met ? "criterion_met" : trendArrow(p.last5) === "down" ? "declining_trend" : null;
        return {
          programId: p.id, goalName: p.name, domain: p.domain, status: p.status,
          currentMeanPct: p.last5.length ? Math.round(p.last5.reduce((a, b) => a + b, 0) / p.last5.length) : null,
          lastRunDaysAgo: null, attentionFlag: flag,
          isBehaviourProgram: p.targetDirection === "decrease" || p.mode === "abc",
        };
      });
      const res = await fetch("/api/session-plan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: client.id, clientName: client.name, plannedDurationMin: duration,
          location, focus: focus || null, goals, clientInterests: client.interests,
        }),
      });
      const data = (await res.json()) as { ok: boolean; plan?: SessionPlanDraft; error?: string };
      if (!data.ok || !data.plan) throw new Error(data.error ?? "Plan suggestion unavailable.");
      await saveSessionPlan(s.id, data.plan);
      onChange();
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Plan suggestion unavailable — you can still start the session.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const s = await ensureSession();
    await startRunSession(s.id);
    onChange();
  };

  const plan = session?.plan ?? null;

  return (
    <div>
      {lastDone && !session ? (
        <p className="sub" style={{ marginBottom: 12 }}>
          Last session completed {lastDone.endTime?.slice(0, 10)} — its data already updated the graphs and mastery status.
        </p>
      ) : null}

      <div className="card card-pad">
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Plan this session</h2>
        <p className="sub">The session is already bound to {client.name}&rsquo;s record — programming, goals and history come with it.</p>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 14 }}>
          <div className="field">
            <label htmlFor="pl-dur">Planned duration</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DURATIONS.map((d) => (
                <button key={d} className={`mode-tab ${duration === d ? "active" : ""}`} onClick={() => setDuration(d)}>
                  {d >= 120 ? `${d / 60} h` : `${d} min`}
                </button>
              ))}
              <input id="pl-dur" className="input" style={{ width: 90 }} type="number" min={15} step={15}
                value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} aria-label="Custom duration (minutes)" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pl-loc">Location</label>
            <select id="pl-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pl-svc">Service type</label>
            <select id="pl-svc" className="input" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              <option>Direct Therapy</option><option>Parent Coaching</option><option>Supervision</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pl-focus">Session focus (optional)</label>
            <input id="pl-focus" className="input" value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. generalize requesting to snack routine" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn" onClick={suggest} disabled={busy || !runnable.length}>
            {busy ? "Building plan…" : "Suggest session plan"}
          </button>
          <button className="btn secondary" onClick={start} disabled={busy}>Start without a plan</button>
        </div>
        {planError ? <p className="sub" style={{ color: "var(--warn)", marginTop: 8 }}>{planError}</p> : null}
      </div>

      {plan ? <PlanReview plan={plan} programs={programs} session={session!} onStart={start} onChange={onChange} /> : null}
    </div>
  );
}

function PlanReview({ plan, programs, session, onStart, onChange }: {
  plan: SessionPlanDraft; programs: Program[]; session: RunSession; onStart: () => void; onChange: () => void;
}) {
  const name = (id: string) => programs.find((p) => p.id === id)?.name ?? id;
  const notPlanned = programs.filter(
    (p) => (p.status === "active" || p.status === "maintenance")
      && !plan.priorityProgramIds.includes(p.id) && !plan.maintenanceProgramIds.includes(p.id),
  );

  const removePriority = (id: string) =>
    void saveSessionPlan(session.id, { ...plan, priorityProgramIds: plan.priorityProgramIds.filter((x) => x !== id) }).then(onChange);
  const addPriority = (id: string) =>
    id && void saveSessionPlan(session.id, { ...plan, priorityProgramIds: [...plan.priorityProgramIds, id] }).then(onChange);

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Today&rsquo;s session</h2>
        <span className="pill accent">Suggested — edit before starting</span>
      </div>
      <p className="sub">{plan.rationale}</p>

      <h3 className="plan-h">Priority goals</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {plan.priorityProgramIds.map((id) => (
          <span key={id} className="pill accent" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {name(id)}
            <button className="chip-x" aria-label={`Remove ${name(id)} from priorities`} onClick={() => removePriority(id)}>×</button>
          </span>
        ))}
        {notPlanned.length ? (
          <select className="input" style={{ width: "auto", padding: "4px 8px" }} value=""
            onChange={(e) => addPriority(e.target.value)} aria-label="Add a priority goal">
            <option value="">+ add goal…</option>
            {notPlanned.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {plan.activities.length ? (<><h3 className="plan-h">Suggested activities</h3>
        <ul className="plan-list">{plan.activities.map((a) => <li key={a.name}>{a.name}</li>)}</ul></>) : null}
      {plan.materials.length ? (<><h3 className="plan-h">Suggested toys / materials</h3>
        <p className="sub" style={{ marginTop: 4 }}>{plan.materials.join(" · ")}</p></>) : null}
      {plan.maintenanceProgramIds.length ? (<><h3 className="plan-h">Maintenance opportunities</h3>
        <p className="sub" style={{ marginTop: 4 }}>{plan.maintenanceProgramIds.map(name).join(" · ")}</p></>) : null}
      {plan.generalization.length ? (<><h3 className="plan-h">Generalization opportunities</h3>
        <ul className="plan-list">{plan.generalization.map((g) => <li key={g}>{g}</li>)}</ul></>) : null}
      {plan.behaviourNotes.length ? (<><h3 className="plan-h">Behaviour programming</h3>
        <ul className="plan-list">{plan.behaviourNotes.map((b) => <li key={b}>{b}</li>)}</ul></>) : null}
      {plan.flow.length ? (<><h3 className="plan-h">Approximate flow</h3>
        <ol className="plan-list">{plan.flow.map((f) => <li key={f}>{f}</li>)}</ol></>) : null}

      <div style={{ marginTop: 16 }}>
        <button className="btn lg" onClick={onStart}>Start session</button>
      </div>
    </div>
  );
}

/* ---- SESSION TAB · one vertical page ---------------------------------------- */

function SessionTab({ client, programs, session, onChange }: {
  client: ClientRow; programs: Program[]; session: RunSession; onChange: () => void;
}) {
  const [now, setNow] = React.useState(Date.now());
  const [activity, setActivity] = React.useState<string>("");
  const [added, setAdded] = React.useState<string[]>([]);
  const [confirmEnd, setConfirmEnd] = React.useState(false);

  // Bind synchronously every render, not just in an effect: an observation must
  // never be stamped with a stale session id from a previous page instance.
  setActiveSession(session.id, client.id);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startedAt = session.startTime ? new Date(session.startTime).getTime() : Date.now();
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const runnable = programs.filter((p) => p.status === "active" || p.status === "maintenance");
  const plan = session.plan;
  const priorityIds = plan?.priorityProgramIds.length ? plan.priorityProgramIds : runnable.slice(0, 3).map((p) => p.id);
  const workspaceIds = new Set([...priorityIds, ...(plan?.maintenanceProgramIds ?? []), ...added]);
  const priority = priorityIds.map((id) => runnable.find((p) => p.id === id)).filter((p): p is Program => !!p);
  const rest = runnable.filter((p) => workspaceIds.has(p.id) && !priorityIds.includes(p.id));
  const available = runnable.filter((p) => !workspaceIds.has(p.id));

  const byDomain = new Map<string, Program[]>();
  for (const p of rest) {
    const d = p.domain ?? "Other";
    byDomain.set(d, [...(byDomain.get(d) ?? []), p]);
  }

  const end = async () => {
    await endRunSession(session.id, programs);
    setActivityContext(null);
    onChange();
  };

  const unfinishedTimers = runnable.filter((p) => {
    const ev = eventsFor(p.id, session.id);
    return p.mode === "duration" && ev.filter((e) => e.code === "start").length > ev.filter((e) => e.code === "stop").length;
  });
  const withData = runnable.filter((p) => eventsFor(p.id, session.id).length);

  return (
    <div>
      <div className="session-bar card">
        <div style={{ minWidth: 0 }}>
          <b>Today&rsquo;s session</b>
          <span className="session-clock" aria-live="off">{fmt(elapsed)}</span>
        </div>
        <label className="sub" htmlFor="run-activity" style={{ marginTop: 0 }}>Activity</label>
        <select
          id="run-activity" className="input" style={{ width: "auto", padding: "6px 8px" }}
          value={activity}
          onChange={(e) => { setActivity(e.target.value); setActivityContext(e.target.value || null); }}
        >
          <option value="">— none —</option>
          {ACTIVITIES.map((a) => <option key={a}>{a}</option>)}
        </select>
        <button className="btn danger" onClick={() => setConfirmEnd(true)}>End session</button>
      </div>

      {confirmEnd ? (
        <div className="card card-pad" style={{ marginTop: 12, borderColor: "var(--warn)" }} role="alertdialog" aria-label="End session check">
          <b>End the session?</b>
          <p className="sub" style={{ marginTop: 6 }}>
            {withData.length} of {runnable.length} programs have data this session.
            {unfinishedTimers.length ? ` Unfinished timer on: ${unfinishedTimers.map((p) => p.name).join(", ")} — stop it first or its interval is discarded.` : ""}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn" onClick={end}>End &amp; review summary</button>
            <button className="btn secondary" onClick={() => setConfirmEnd(false)}>Keep collecting</button>
          </div>
        </div>
      ) : null}

      <SectionLabel>Pinned / priority</SectionLabel>
      {priority.map((p) => <GoalCard key={p.id} program={p} clientId={client.id} startedAt={startedAt} />)}
      {!priority.length ? <p className="sub">No priority goals planned — add one below.</p> : null}

      {[...byDomain.entries()].map(([domain, ps]) => (
        <React.Fragment key={domain}>
          <SectionLabel>{domain}</SectionLabel>
          {ps.map((p) => <GoalCard key={p.id} program={p} clientId={client.id} startedAt={startedAt} />)}
        </React.Fragment>
      ))}

      <SectionLabel>All active programs</SectionLabel>
      {available.length ? (
        <div className="card card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="run-add" className="sub" style={{ marginTop: 0 }}>
            Spontaneous opportunity? Add an existing active goal to today&rsquo;s workspace — this never creates new programming.
          </label>
          <select
            id="run-add" className="input" style={{ width: "auto" }} value=""
            onChange={(e) => { if (e.target.value) setAdded((x) => [...x, e.target.value]); }}
          >
            <option value="">+ Add active goal…</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.name} · {MODE_LABEL[p.mode]}</option>)}
          </select>
        </div>
      ) : (
        <p className="sub">Every active program is already in today&rsquo;s workspace.</p>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="run-section-label">{children}</div>;
}

function GoalCard({ program, clientId, startedAt }: { program: Program; clientId: number; startedAt: number }) {
  const [showInfo, setShowInfo] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const target = currentTarget(program.id);

  return (
    <div className="card card-pad" style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="pill neutral">{MODE_LABEL[program.mode]}</span>
          {program.status === "maintenance" ? <span className="pill good">maintenance</span> : null}
        </div>
        <button className="btn ghost" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          ⓘ Instructions
        </button>
      </div>

      {showInfo ? (
        <div className="run-info" role="region" aria-label={`${program.name} instructions`}>
          <p><b>Operational definition.</b> {program.operationalDefinition}</p>
          {program.sd ? <p><b>SD.</b> &ldquo;{program.sd}&rdquo;</p> : null}
          <p><b>Prompt hierarchy.</b> {PROMPT_ORDER.map((l) => l === program.promptLevel ? `[${l}]` : l).join(" → ")} (current in brackets)</p>
          <p><b>Reinforcement.</b> {program.reinforcementSchedule}</p>
          <p><b>Error correction.</b> Block gently, re-present the SD once, prompt at the current level, reinforce the prompted response on a lean schedule.</p>
          <p><b>Mastery criteria.</b> {program.masteryCriteria}</p>
        </div>
      ) : null}

      {program.targets.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }} role="group" aria-label={`${program.name} targets`}>
          <span className="sub" style={{ marginTop: 4 }}>Target:</span>
          {program.targets.map((t) => (
            <button
              key={t}
              className={`mode-tab ${target === t ? "active" : ""}`}
              aria-pressed={target === t}
              onClick={() => { setCurrentTarget(program.id, target === t ? null : t); force(); }}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <ModePanel program={program} clientId={clientId} startedAt={startedAt} />
      </div>
    </div>
  );
}

function ModePanel({ program, clientId, startedAt }: { program: Program; clientId: number; startedAt: number }) {
  switch (program.mode) {
    case "dtt": return <DttPanel program={program} />;
    case "task_analysis": return <TaskAnalysisPanel program={program} />;
    case "frequency": return <FrequencyPanel program={program} startedAt={startedAt} />;
    case "duration": return <DurationPanel program={program} />;
    case "interval": return <IntervalPanel program={program} />;
    case "abc": return <AbcPanel program={program} clientId={clientId} />;
    case "net": return <NetPanel program={program} />;
    case "yni": return <YniPanel program={program} />;
  }
}

/* ---- AFTER SESSION · summary + SOAP documentation ---------------------------- */

function DocumentationStage({ client, programs, session, onChange }: {
  client: ClientRow; programs: Program[]; session: RunSession; onChange: () => void;
}) {
  const router = useRouter();
  const summaries = summariesFor(session.id);
  const events = eventsForSession(session.id);
  const incidents = incidentsFor(client.id);
  const [note, setNote] = React.useState<SessionNoteDraft | null>(null);
  const [done, setDone] = React.useState(false);

  const metricLabel = (m: (typeof summaries)[number]) => {
    switch (m.metricType) {
      case "percent_independent": return `${m.calculatedValue}% independent (${m.numerator}/${m.denominator})`;
      case "percent_intervals": return `${m.calculatedValue}% of intervals (${m.numerator}/${m.denominator})`;
      case "count": {
        const hrs = (session.actualDurationMin ?? 60) / 60;
        return `${m.calculatedValue} occurrences · ${Math.round(((m.calculatedValue ?? 0) / Math.max(hrs, 1 / 60)) * 10) / 10}/hour`;
      }
      case "total_seconds": return `${Math.floor((m.calculatedValue ?? 0) / 60)}:${String((m.calculatedValue ?? 0) % 60).padStart(2, "0")} total`;
      default: return `${m.rawObservationCount} observation${m.rawObservationCount === 1 ? "" : "s"}`;
    }
  };

  const draftNote = () => {
    const perProgram = summaries.map((m) => {
      const p = programs.find((x) => x.id === m.programId);
      return {
        programName: p?.name ?? m.programId,
        narrative: `${p?.name ?? m.programId}: ${metricLabel(m)} across ${m.rawObservationCount} recorded observations.${p ? ` Prompt level ${p.promptLevel}, schedule ${p.reinforcementSchedule}.` : ""}`,
      };
    });
    const abc = incidents
      .map((i) => `Incident at ${new Date(i.occurredAt).toLocaleTimeString()}: ${i.behaviour}. Antecedent: ${i.antecedent}. Consequence: ${i.consequence}.`)
      .join("\n");
    const masteryLines = summaries
      .map((m) => {
        const p = programs.find((x) => x.id === m.programId);
        if (!p || m.calculatedValue == null || !m.metricType.startsWith("percent")) return null;
        const mc = masteryCheck(p, m.calculatedValue);
        return mc.met ? `${p.name} met the session criterion (${p.masteryCriteria}) — supervisor confirmation required.` : null;
      })
      .filter(Boolean)
      .join(" ");
    setNote({
      sessionId: session.id,
      clientId: client.id,
      subjective: "",
      objective: [
        `${session.serviceType ?? "Session"} at ${session.location ?? "clinic"}, ${session.actualDurationMin ?? "—"} minutes.`,
        `${summaries.length} program${summaries.length === 1 ? "" : "s"} addressed, ${events.length} atomic observations, ${incidents.length} behaviour incident${incidents.length === 1 ? "" : "s"}.`,
      ].join(" "),
      assessment: masteryLines || "Performance consistent with current programming; no criterion changes indicated from today's data.",
      plan: session.plan?.flow.length ? `Continue current programming. Next session: ${session.plan.flow[Math.min(1, session.plan.flow.length - 1)]}.` : "Continue current programming.",
      perProgram,
      abcNarrative: abc,
      billableCode: "97153",
      status: "draft",
    });
  };

  const sign = async () => {
    if (!note) return;
    await saveNote({ ...note, status: "awaiting_countersign" });
    await completeRunSession(session.id, programs);
    setDone(true); // stay on the completion screen; "Plan the next session" re-renders the parent
  };

  if (done || session.status === "completed" || session.status === "locked") {
    return (
      <div className="card card-pad" role="status">
        <b>Session completed.</b>
        <p className="sub" style={{ marginTop: 8 }}>This session&rsquo;s observations automatically updated:</p>
        <ul className="plan-list">
          <li>Graphs and goal progress (new data points added)</li>
          <li>Mastery status (criteria re-evaluated against the new session)</li>
          <li>Clinical Signals, Case Review and the Supervision Brief</li>
          <li>Progress-report and treatment-planning evidence</li>
        </ul>
        <p className="sub">The SOAP note is in your supervisor&rsquo;s Review Queue; the session locks on countersign.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <Link href={`/clients/${client.id}/graphs`} className="btn" style={{ textDecoration: "none" }}>See updated graphs</Link>
          <Link href={`/clients/${client.id}/sessions`} className="btn secondary" style={{ textDecoration: "none" }}>Session history</Link>
          <button className="btn secondary" onClick={() => { router.refresh(); onChange(); }}>Plan the next session</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Session summary</h2>
          <span className="pill warn">Documentation stage</span>
        </div>
        <p className="sub">
          {session.actualDurationMin ?? "—"} minutes · {summaries.length} programs addressed · {events.length} observations · {incidents.length} ABC entr{incidents.length === 1 ? "y" : "ies"}
        </p>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead><tr><th>Program</th><th>Session metric</th><th>Raw observations</th></tr></thead>
            <tbody>
              {summaries.map((m) => (
                <tr key={m.programId}>
                  <td><b>{programs.find((p) => p.id === m.programId)?.name ?? m.programId}</b></td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{metricLabel(m)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.rawObservationCount}</td>
                </tr>
              ))}
              {!summaries.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No data was collected this session.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          Metrics are derived from the raw observations, which remain the source of truth — nothing here was entered by hand.
        </p>
      </div>

      {!note ? (
        <div style={{ marginTop: 14 }}>
          <button className="btn lg" onClick={draftNote}>Complete documentation — draft SOAP note</button>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>SOAP note</h2>
            <span className="pill accent">Objective drafted from this session&rsquo;s data</span>
          </div>
          <div className="field"><label htmlFor="s-s">S — Subjective (context, caregiver report)</label>
            <textarea id="s-s" className="input" value={note.subjective} placeholder="Caregiver reported…, client arrived…"
              onChange={(e) => setNote({ ...note, subjective: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-o">O — Objective (from atomic observations)</label>
            <textarea id="s-o" className="input" value={note.objective}
              onChange={(e) => setNote({ ...note, objective: e.target.value })} /></div>
          {note.perProgram.map((p, i) => (
            <div className="field" key={p.programName}>
              <label htmlFor={`s-p${i}`}>{p.programName}</label>
              <textarea id={`s-p${i}`} className="input" value={p.narrative}
                onChange={(e) => {
                  const per = [...note.perProgram]; per[i] = { ...per[i], narrative: e.target.value };
                  setNote({ ...note, perProgram: per });
                }} />
            </div>
          ))}
          {note.abcNarrative ? (
            <div className="field"><label htmlFor="s-abc">Behaviour incidents (ABC)</label>
              <textarea id="s-abc" className="input" value={note.abcNarrative}
                onChange={(e) => setNote({ ...note, abcNarrative: e.target.value })} /></div>
          ) : null}
          <div className="field"><label htmlFor="s-a">A — Assessment</label>
            <textarea id="s-a" className="input" value={note.assessment}
              onChange={(e) => setNote({ ...note, assessment: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-pl">P — Plan</label>
            <textarea id="s-pl" className="input" value={note.plan}
              onChange={(e) => setNote({ ...note, plan: e.target.value })} /></div>
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="s-code">Billable service code</label>
            <select id="s-code" className="input" value={note.billableCode}
              onChange={(e) => setNote({ ...note, billableCode: e.target.value as SessionNoteDraft["billableCode"] })}>
              <option value="97153">97153 · Direct treatment by technician</option>
              <option value="97155">97155 · Protocol modification</option>
              <option value="97156">97156 · Family guidance</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn lg" onClick={sign}>Sign &amp; submit for countersign</button>
            <button className="btn secondary" onClick={() => saveNote(note)}>Save draft</button>
          </div>
        </div>
      )}
    </div>
  );
}
