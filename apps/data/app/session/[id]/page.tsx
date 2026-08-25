"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPrograms, getSession } from "@/lib/data";
import {
  AbcPanel, DttPanel, DurationPanel, FrequencyPanel, IntervalPanel, NetPanel, TaskAnalysisPanel, YniPanel,
} from "@/components/modes";
import { MODE_LABEL, type Program, type ScheduledSession } from "@/lib/types";

export default function ActiveSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const [session, setSession] = React.useState<ScheduledSession | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [startedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(Date.now());
  const [savedAgo, setSavedAgo] = React.useState(0);

  React.useEffect(() => {
    void getSession(sessionId).then((s) => {
      setSession(s);
      if (s) void getPrograms(s.clientId).then((ps) => { setPrograms(ps); setActiveId(ps[0]?.id ?? null); });
    });
  }, [sessionId]);

  React.useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); setSavedAgo((s) => (s + 1) % 24); }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!session) return <p className="sub">Loading session…</p>;
  const active = programs.find((p) => p.id === activeId) ?? null;
  const elapsed = Math.floor((now - startedAt) / 1000);
  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div>
      {/* session header */}
      <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>{session.clientName} · {session.type}</h1>
          <p className="sub">{session.location} · started {session.time}</p>
        </div>
        <span className="pill danger" aria-live="off">● Recording {fmt(elapsed)}</span>
        <span className="pill neutral">Auto-saved {savedAgo}s ago</span>
        <Link href={`/session/${sessionId}/note`} className="btn" style={{ textDecoration: "none" }}>
          End &amp; draft note
        </Link>
      </div>

      {/* program tabs (mode shown per program) */}
      <div className="mode-tabs" style={{ marginTop: 16 }} role="tablist" aria-label="Programs in this session">
        {programs.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === activeId}
            className={`mode-tab ${p.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(p.id)}
          >
            {p.name} · {MODE_LABEL[p.mode]}
          </button>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        {active ? <ModePanel program={active} clientId={session.clientId} startedAt={startedAt} /> : (
          <p className="sub">No active programs for this client yet — add goals from their caseload page.</p>
        )}
      </div>

      <p className="sub" style={{ marginTop: 10 }}>
        ● Online · syncing — data captures locally and syncs on reconnect.
      </p>
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
