"use client";

import * as React from "react";
import { eventsFor, incidentsFor, recordEvent, recordIncident, undoLastEvent } from "@/lib/data";
import { frequencySummary, masteryCheck, sessionPercent } from "@/lib/mastery";
import { FUNCTION_LABEL, PROMPT_ORDER, type Program } from "@/lib/types";

/* Shared bits ---------------------------------------------------------------- */

function useBump(): [number, () => void] {
  const [n, setN] = React.useState(0);
  return [n, () => setN((x) => x + 1)];
}

function log(program: Program, code: string, extra?: { stepPosition?: number; note?: string }) {
  return recordEvent(
    {
      programId: program.id, mode: program.mode, code,
      stepPosition: extra?.stepPosition ?? null,
      promptLevel: code === "P" ? program.promptLevel : null,
      note: extra?.note ?? null,
    },
    {},
  );
}

function Header({ program, right }: { program: Program; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
      <div>
        <b>{program.name}</b>
        {program.sd ? <span className="sub" style={{ marginLeft: 8 }}>SD: &ldquo;{program.sd}&rdquo;</span> : null}
      </div>
      {right}
    </div>
  );
}

function Last5({ program, today }: { program: Program; today: number | null }) {
  const seq = today == null ? program.last5 : [...program.last5, today];
  const mc = masteryCheck(program, today);
  return (
    <p className="trend" style={{ marginTop: 10 }}>
      Last sessions: <b>{seq.length ? seq.join(" → ") : "—"}</b>
      {mc.met ? <span className="pill good" style={{ marginLeft: 8 }}>Mastery criterion met</span> : null}
    </p>
  );
}

/* 1 · DTT -------------------------------------------------------------------- */

export function DttPanel({ program }: { program: Program }) {
  const [, bump] = useBump();
  const trials = eventsFor(program.id).filter((e) => ["Y", "P", "N"].includes(e.code));
  const pct = sessionPercent(program, eventsFor(program.id));
  const TRIALS = 10;
  return (
    <div>
      <Header
        program={program}
        right={<span className="pill accent">{pct != null ? `${pct}% today` : "No trials yet"}</span>}
      />
      <div className="dot-grid" style={{ marginTop: 12 }} aria-label="Trial results">
        {Array.from({ length: Math.max(TRIALS, trials.length) }, (_, i) => {
          const t = trials[i];
          const cls = t ? (t.code === "Y" ? "y" : t.code === "P" ? "p" : "n") : "";
          return <span key={i} className={`dot ${cls}`}>{t ? t.code : i + 1}</span>;
        })}
      </div>
      <div className="tap-row" style={{ marginTop: 14 }}>
        <button className="tap y big" onClick={() => log(program, "Y").then(bump)}>Y<small style={{ display: "block", fontSize: 11, fontWeight: 500 }}>independent</small></button>
        <button className="tap p big" onClick={() => log(program, "P").then(bump)}>P<small style={{ display: "block", fontSize: 11, fontWeight: 500 }}>prompted · {program.promptLevel}</small></button>
        <button className="tap n big" onClick={() => log(program, "N").then(bump)}>N<small style={{ display: "block", fontSize: 11, fontWeight: 500 }}>no response</small></button>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button className="btn ghost" onClick={() => undoLastEvent(program.id).then(bump)}>Undo last</button>
      </div>
      <Last5 program={program} today={pct} />
    </div>
  );
}

/* 2 · Task Analysis ---------------------------------------------------------- */

export function TaskAnalysisPanel({ program }: { program: Program }) {
  const [, bump] = useBump();
  const ev = eventsFor(program.id);
  const stepCode = (pos: number) => ev.filter((e) => e.stepPosition === pos).at(-1)?.code;
  const pct = sessionPercent(program, ev);
  return (
    <div>
      <Header program={program} right={<span className="pill accent">{pct != null ? `${pct}% independent today` : "Mark each step"}</span>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {program.steps.map((s) => {
          const code = stepCode(s.position);
          return (
            <div key={s.id} className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
              <span className={`dot ${code === "Y" ? "y" : code === "P" ? "p" : code === "N" ? "n" : ""}`}>{s.position}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: "var(--text-sm)" }}>{s.description}</b>
                <span className="sub" style={{ marginLeft: 8 }}>{s.status}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Y", "P", "N"] as const).map((c) => (
                  <button
                    key={c}
                    className={`tap ${c.toLowerCase()}`}
                    style={{ minWidth: 52, minHeight: 44, fontSize: "var(--text-md)", flex: "none" }}
                    aria-pressed={code === c}
                    onClick={() => log(program, c, { stepPosition: s.position }).then(bump)}
                  >
                    {c === "Y" ? "I" : c}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Last5 program={program} today={pct} />
    </div>
  );
}

/* 3 · Frequency -------------------------------------------------------------- */

export function FrequencyPanel({ program, startedAt }: { program: Program; startedAt: number }) {
  const [, bump] = useBump();
  const { count, ratePerHour } = frequencySummary(program.id, eventsFor(program.id), startedAt);
  const avg = program.last5.length ? Math.round(program.last5.reduce((a, b) => a + b, 0) / program.last5.length) : null;
  return (
    <div>
      <Header program={program} right={<span className="pill accent">{ratePerHour} / hour</span>} />
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
        <button className="tap n big" style={{ maxWidth: 120 }} aria-label="Remove one" onClick={() => log(program, "-").then(bump)}>−</button>
        <div style={{ textAlign: "center", minWidth: 120 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{count}</div>
          <div className="sub">occurrences this session</div>
        </div>
        <button className="tap y big" style={{ maxWidth: 120 }} aria-label="Add one" onClick={() => log(program, "+").then(bump)}>+</button>
      </div>
      {avg != null ? (
        <p className="trend" style={{ marginTop: 12 }}>
          5-session average: <b>{avg}/session</b> · target direction: <b>{program.targetDirection}</b>
        </p>
      ) : null}
    </div>
  );
}

/* 4 · Duration ---------------------------------------------------------------- */

export function DurationPanel({ program }: { program: Program }) {
  const [running, setRunning] = React.useState<number | null>(null);
  const [total, setTotal] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (running == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const live = running != null ? Math.floor((now - running) / 1000) : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const target = program.dailyTargetMinutes;

  return (
    <div>
      <Header program={program} right={target ? <span className="pill accent">Target: {target} min in one block</span> : undefined} />
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: running != null ? "var(--accent)" : "var(--ink)" }}>
          {fmt(live)}
        </div>
        <div className="sub" style={{ marginTop: 4 }}>current interval · session total {fmt(total + live)}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
          {running == null ? (
            <button className="btn lg" onClick={() => { setRunning(Date.now()); void log(program, "start"); }}>Start interval</button>
          ) : (
            <button className="btn lg danger" onClick={() => { setTotal((t) => t + live); setRunning(null); void log(program, "stop", { note: `${live}s` }); }}>
              Stop interval
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* 5 · Interval (partial, 30s blocks) ------------------------------------------ */

export function IntervalPanel({ program }: { program: Program }) {
  const [, bump] = useBump();
  const [blockEnd, setBlockEnd] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const blocks = eventsFor(program.id).filter((e) => e.code === "hit" || e.code === "miss");
  const pct = sessionPercent(program, eventsFor(program.id));
  const remaining = blockEnd != null ? Math.max(0, Math.ceil((blockEnd - now) / 1000)) : null;
  const inBlock = remaining != null && remaining > 0;
  const blockDone = remaining === 0;

  const mark = (code: "hit" | "miss") => {
    void log(program, code, { stepPosition: blocks.length + 1 }).then(() => { setBlockEnd(null); bump(); });
  };

  return (
    <div>
      <Header program={program} right={<span className="pill accent">{pct != null ? `${pct}% of intervals` : `${program.intervalSeconds}s partial interval`}</span>} />
      <div className="dot-grid" style={{ marginTop: 12 }}>
        {blocks.map((b, i) => <span key={b.id} className={`dot ${b.code === "hit" ? "y" : "n"}`}>{i + 1}</span>)}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        {inBlock ? (
          <div style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{remaining}s</div>
        ) : blockDone ? (
          <p style={{ fontWeight: 600 }}>Block ended — did the behaviour occur at any point?</p>
        ) : (
          <p className="sub">Start a {program.intervalSeconds}-second observation block.</p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
          {!inBlock && !blockDone ? (
            <button className="btn lg" onClick={() => setBlockEnd(Date.now() + program.intervalSeconds * 1000)}>Start block {blocks.length + 1}</button>
          ) : null}
          {blockDone ? (
            <>
              <button className="tap y" style={{ maxWidth: 160 }} onClick={() => mark("hit")}>Occurred</button>
              <button className="tap n" style={{ maxWidth: 160 }} onClick={() => mark("miss")}>Did not</button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* 6 · ABC --------------------------------------------------------------------- */

export function AbcPanel({ program, clientId }: { program: Program; clientId: number }) {
  const [, bump] = useBump();
  const [f, setF] = React.useState({ antecedent: "", behaviour: "", consequence: "", fn: "" });
  const incidents = incidentsFor(clientId);
  const save = () => {
    void recordIncident({
      clientId, antecedent: f.antecedent, behaviour: f.behaviour, consequence: f.consequence,
      suspectedFunction: (f.fn || null) as never,
    }).then(() => { setF({ antecedent: "", behaviour: "", consequence: "", fn: "" }); bump(); });
  };
  return (
    <div>
      <Header program={program} right={<span className="pill warn">Escalates to supervisor at threshold</span>} />
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div className="field"><label htmlFor="abc-a">Antecedent — what happened right before</label>
          <textarea id="abc-a" className="input" value={f.antecedent} onChange={(e) => setF({ ...f, antecedent: e.target.value })} /></div>
        <div className="field"><label htmlFor="abc-b">Behaviour — operationally defined</label>
          <textarea id="abc-b" className="input" value={f.behaviour} onChange={(e) => setF({ ...f, behaviour: e.target.value })} /></div>
        <div className="field"><label htmlFor="abc-c">Consequence — what followed</label>
          <textarea id="abc-c" className="input" value={f.consequence} onChange={(e) => setF({ ...f, consequence: e.target.value })} /></div>
        <div className="field"><label htmlFor="abc-f">Suspected function</label>
          <select id="abc-f" className="input" value={f.fn} onChange={(e) => setF({ ...f, fn: e.target.value })}>
            <option value="">Select…</option>
            {Object.entries(FUNCTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div>
          <button className="btn" onClick={save} disabled={!f.antecedent || !f.behaviour || !f.consequence}>Log incident</button>
        </div>
      </div>
      {incidents.length ? (
        <p className="trend" style={{ marginTop: 12 }}>{incidents.length} incident{incidents.length === 1 ? "" : "s"} logged this session.</p>
      ) : null}
    </div>
  );
}

/* 7 · NET ---------------------------------------------------------------------- */

export function NetPanel({ program }: { program: Program }) {
  const [, bump] = useBump();
  const ev = eventsFor(program.id).filter((e) => e.code === "spont" || e.code === "prompted");
  const spont = ev.filter((e) => e.code === "spont").length;
  const pct = sessionPercent(program, eventsFor(program.id));
  return (
    <div>
      <Header program={program} right={<span className="pill accent">{pct != null ? `${pct}% spontaneous` : "Tally in the natural context"}</span>} />
      <div className="tap-row" style={{ marginTop: 14 }}>
        <button className="tap y big" onClick={() => log(program, "spont").then(bump)}>
          + Spontaneous<small style={{ display: "block", fontSize: 12, fontWeight: 500 }}>{spont} so far</small>
        </button>
        <button className="tap p big" onClick={() => log(program, "prompted").then(bump)}>
          + Prompted<small style={{ display: "block", fontSize: 12, fontWeight: 500 }}>{ev.length - spont} so far</small>
        </button>
      </div>
      <Last5 program={program} today={pct} />
    </div>
  );
}

/* 8 · Yes / No / Incomplete ----------------------------------------------------- */

export function YniPanel({ program }: { program: Program }) {
  const [, bump] = useBump();
  const current = program.steps.find((s) => s.status === "teaching") ?? program.steps[0];
  const recent = [...program.last5.map((p) => (p >= 100 ? "Y" : p <= 0 ? "N" : "I")),
    ...eventsFor(program.id).filter((e) => ["yes", "no", "inc"].includes(e.code)).map((e) => e.code[0].toUpperCase())];
  const streak = (() => { let n = 0; for (let i = recent.length - 1; i >= 0 && recent[i] === "Y"; i--) n++; return n; })();
  return (
    <div>
      <Header program={program} right={current ? <span className="pill accent">Current step {current.position}: {current.description}</span> : undefined} />
      <div className="tap-row" style={{ marginTop: 14 }}>
        <button className="tap y big" onClick={() => log(program, "yes", { stepPosition: current?.position }).then(bump)}>Yes</button>
        <button className="tap n big" onClick={() => log(program, "no", { stepPosition: current?.position }).then(bump)}>No</button>
        <button className="tap p big" onClick={() => log(program, "inc", { stepPosition: current?.position }).then(bump)}>Incomplete</button>
      </div>
      <p className="trend" style={{ marginTop: 12 }}>
        Recent: <b>{recent.slice(-5).join(" ")}</b>
        {streak >= 3 ? <span className="pill good" style={{ marginLeft: 8 }}>3 consecutive Yes — advance to the next step</span> : null}
      </p>
    </div>
  );
}
