"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { eventsForSession, getNote, getPrograms, runSessionsFor, summariesFor } from "@/lib/data";
import { getSetting } from "@summit/settings";
import { MODE_LABEL, type Program, type RunSession, type SessionProgramSummary } from "@/lib/types";

/**
 * Graphs — the aggregated longitudinal view of completed session data. Graphs
 * are never populated by hand: every point is a derived session metric, and
 * points backed by a session on this device open the full lineage — session →
 * raw observations → program version → SOAP note.
 */

interface GraphPoint {
  date: string;
  value: number;
  session: RunSession | null;             // null = historical summary (no atomic record on this device)
  summary: SessionProgramSummary | null;
}

export default function GraphsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [selected, setSelected] = React.useState<{ program: Program; point: GraphPoint } | null>(null);
  const [view, setView] = React.useState<"program" | "target">("program");

  React.useEffect(() => {
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  const completed = runSessionsFor(clientId).filter((s) => s.status === "completed" || s.status === "locked");

  const pointsFor = (p: Program): GraphPoint[] => {
    // Session-backed points: completed sessions on this device with a summary for this program.
    const backed: GraphPoint[] = completed
      .flatMap((s) => summariesFor(s.id).filter((m) => m.programId === p.id).map((m) => ({ s, m })))
      .filter(({ m }) => m.calculatedValue != null && (m.metricType.startsWith("percent") || m.metricType === "count"))
      .map(({ s, m }) => ({ date: (s.endTime ?? s.createdAt).slice(0, 10), value: m.calculatedValue as number, session: s, summary: m }))
      .sort((a, b) => a.date.localeCompare(b.date));
    // Historical points: earlier summaries carried on the program record (completed
    // sessions already appended theirs to last5, so trim those off the tail).
    const historic = p.last5.slice(0, Math.max(p.last5.length - backed.length, 0));
    const historicPoints: GraphPoint[] = historic.map((v, i) => ({
      date: new Date(Date.now() - (historic.length - i + backed.length) * 3.5 * 86_400_000).toISOString().slice(0, 10),
      value: v, session: null, summary: null,
    }));
    return [...historicPoints, ...backed];
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <p className="sub" style={{ marginTop: 0 }}>
          Every point is a derived session metric — click one to open its evidence lineage.
        </p>
        <div className="mode-tabs" role="tablist" aria-label="Graph view">
          {(["program", "target"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={`mode-tab ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
              {v === "program" ? "Program" : "Target"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
        {programs.map((p) => {
          const pts = pointsFor(p);
          if (!pts.length) return null;
          return (
            <div key={p.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <b>{p.name}</b>
                  <span className="pill neutral" style={{ marginLeft: 8 }}>{MODE_LABEL[p.mode]}</span>
                </div>
                <span className="trend">
                  {p.mode === "frequency" ? "occurrences / session" : "% per session"} · mastery {p.masteryPct}% × {p.masteryConsecutive}
                </span>
              </div>
              {view === "program" ? (
                <Chart
                  points={pts}
                  isPercent={p.mode !== "frequency"}
                  masteryPct={p.mode !== "frequency" && getSetting("graphs.masteryLine") === true ? p.masteryPct : null}
                  onSelect={(pt) => setSelected({ program: p, point: pt })}
                  selectedDate={selected?.program.id === p.id ? selected.point.date : null}
                />
              ) : (
                <TargetView program={p} sessions={completed} />
              )}
            </div>
          );
        })}
        {!programs.some((p) => pointsFor(p).length) ? (
          <div className="card card-pad"><p className="sub">No completed session data yet — run a session and its metrics will appear here automatically.</p></div>
        ) : null}
      </div>

      {selected ? <LineagePanel clientId={clientId} program={selected.program} point={selected.point} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function Chart({ points, isPercent, masteryPct, onSelect, selectedDate }: {
  points: GraphPoint[]; isPercent: boolean; masteryPct: number | null;
  onSelect: (p: GraphPoint) => void; selectedDate: string | null;
}) {
  const W = 640, H = 170, PAD = 30;
  const max = isPercent ? 100 : Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => PAD + (points.length === 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Session performance over time">
        {[0, 25, 50, 75, 100].filter((g) => isPercent || g <= 100).map((g) => (
          <line key={g} x1={PAD} x2={W - PAD} y1={y((g / 100) * max)} y2={y((g / 100) * max)} className="graph-grid" />
        ))}
        {masteryPct != null ? (
          <line x1={PAD} x2={W - PAD} y1={y(masteryPct)} y2={y(masteryPct)} className="graph-mastery" />
        ) : null}
        <path d={path} className="graph-line" fill="none" />
        {points.map((p, i) => (
          <g key={`${p.date}-${i}`} role="button" tabIndex={0} aria-label={`${p.date}: ${p.value}${isPercent ? "%" : ""}${p.session ? ", open evidence" : ", historical summary"}`}
            onClick={() => onSelect(p)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p); } }}
            style={{ cursor: "pointer" }}>
            {getSetting("a11y.colorBlindGraphs") === true && p.session ? (
              <rect x={x(i) - 5} y={y(p.value) - 5} width={10} height={10} className="graph-dot backed" />
            ) : (
              <circle cx={x(i)} cy={y(p.value)} r={selectedDate === p.date ? 7 : 5}
                className={`graph-dot ${p.session ? "backed" : ""} ${selectedDate === p.date ? "sel" : ""}`} />
            )}
            {getSetting("graphs.pointValues") === true ? (
              <text x={x(i)} y={y(p.value) - 10} textAnchor="middle" className="graph-val">{p.value}{isPercent ? "%" : ""}</text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="trend" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{points[0]?.date}</span>
        <span>◦ historical summary · ● session on this device (click for lineage)</span>
        <span>{points.at(-1)?.date}</span>
      </div>
    </div>
  );
}

function TargetView({ program, sessions }: { program: Program; sessions: RunSession[] }) {
  const byTarget = new Map<string, { y: number; total: number }>();
  for (const s of sessions) {
    for (const e of eventsForSession(s.id).filter((e) => e.programId === program.id && e.target)) {
      const t = byTarget.get(e.target!) ?? { y: 0, total: 0 };
      if (["Y", "spont", "yes", "hit"].includes(e.code)) t.y += 1;
      if (!["start", "stop", "-"].includes(e.code)) t.total += 1;
      byTarget.set(e.target!, t);
    }
  }
  if (!program.targets.length) return <p className="sub" style={{ marginTop: 10 }}>This program has no targets configured — target-level graphing needs exemplars on the program.</p>;
  if (!byTarget.size) return <p className="sub" style={{ marginTop: 10 }}>No target-tagged observations yet. Select a target chip while collecting and each observation carries it.</p>;
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table className="data">
        <thead><tr><th scope="col">Target</th><th scope="col">Independent</th><th scope="col">Opportunities</th><th scope="col">Performance</th></tr></thead>
        <tbody>
          {[...byTarget.entries()].map(([t, v]) => (
            <tr key={t}>
              <td><b>{t}</b></td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{v.y}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{v.total}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{v.total ? Math.round((v.y / v.total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineagePanel({ clientId, program, point, onClose }: {
  clientId: number; program: Program; point: GraphPoint; onClose: () => void;
}) {
  const s = point.session;
  const m = point.summary;
  const ev = s ? eventsForSession(s.id).filter((e) => e.programId === program.id) : [];
  const note = s ? getNote(s.id) : undefined;
  const snapshot = s?.programVersionSnapshot.find((x) => x.programId === program.id);

  const byActivity = new Map<string, number>();
  for (const e of ev) byActivity.set(e.activityContext ?? "No activity tagged", (byActivity.get(e.activityContext ?? "No activity tagged") ?? 0) + 1);

  return (
    <div className="card card-pad lineage" role="region" aria-label="Evidence lineage">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <b>Evidence: {program.name} · {point.date}</b>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      {s && m ? (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          <p className="sub" style={{ marginTop: 0 }}>
            Session #{s.id} · {s.serviceType ?? "Session"} at {s.location ?? "clinic"} · {s.actualDurationMin ?? "—"} min · status {s.status}
          </p>
          <p>
            <b>{point.value}{m.metricType.startsWith("percent") ? "%" : ""}</b> derived from{" "}
            <b>{m.rawObservationCount}</b> raw observations
            {m.numerator != null && m.denominator != null ? <> — {m.numerator} independent of {m.denominator} opportunities</> : null}.
            The raw observations remain authoritative; this value is recomputable from them.
          </p>
          <p className="sub" style={{ marginTop: 0 }}>
            Observation tally: {ev.filter((e) => e.code === "Y").length}× Y · {ev.filter((e) => e.code === "P").length}× P · {ev.filter((e) => e.code === "N").length}× N
            {ev.some((e) => e.target) ? <> · targets: {[...new Set(ev.filter((e) => e.target).map((e) => e.target))].join(", ")}</> : null}
          </p>
          {byActivity.size > 1 ? (
            <p className="sub" style={{ marginTop: 0 }}>
              By activity: {[...byActivity.entries()].map(([a, n]) => `${a} (${n})`).join(" · ")}
            </p>
          ) : null}
          {snapshot ? (
            <p className="sub" style={{ marginTop: 0 }}>
              Program version at session time: prompt level <b>{snapshot.promptLevel}</b> · mastery {snapshot.masteryCriteria}
            </p>
          ) : null}
          <p className="sub" style={{ marginTop: 0 }}>
            SOAP note: {note ? <>status <b>{note.status}</b> — see <Link href={`/clients/${clientId}/sessions`} style={{ color: "var(--accent)" }}>session history</Link></> : "not drafted on this device"}
          </p>
        </div>
      ) : (
        <p className="sub" style={{ marginTop: 8 }}>
          Historical session summary carried on the program record — the derived value is shown, but the atomic observations for this
          point live in the clinic database, not on this device. Points recorded here open their full lineage.
        </p>
      )}
    </div>
  );
}
