"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPrograms, hydrateClientHistory, runSessionsFor } from "@/lib/data";
import { trendArrow } from "@/lib/mastery";
import { blockEndingSoon, blockFor } from "@/lib/clinical-docs";
import type { Program, RunSession } from "@/lib/types";

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;

/** Overview — the snapshot a clinician reads before doing anything else. */
export default function ClientOverviewPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [sessions, setSessions] = React.useState<RunSession[]>([]);

  React.useEffect(() => {
    void getPrograms(clientId).then(setPrograms);
    let cancelled = false;
    hydrateClientHistory(clientId).catch(() => { /* best-effort — falls back to this device's own history */ })
      .finally(() => { if (!cancelled) setSessions(runSessionsFor(clientId)); });
    return () => { cancelled = true; };
  }, [clientId]);

  const active = programs.filter((p) => p.status === "active");
  const mastered = programs.filter((p) => p.status === "mastered" || p.status === "maintenance");
  const completed = sessions.filter((s) => s.status === "completed" || s.status === "locked");

  const block = blockFor(clientId);

  return (
    <div>
      {block ? (
        <div className="card card-pad" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", ...(blockEndingSoon(block) ? { borderColor: "var(--warn)" } : {}) }}>
          <span><b>{block.name}</b> <span className="sub" style={{ marginLeft: 8 }}>{block.start} → {block.end}</span></span>
          {blockEndingSoon(block) ? (
            <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill warn">Final 2 weeks — End of Block Summary due</span>
              <Link href={`/clients/${clientId}/report/block-summary`} className="btn" style={{ textDecoration: "none" }}>Start summary</Link>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="tiles">
        <div className="card tile"><div className="n">{active.length}</div><div className="l">Active goals</div></div>
        <div className="card tile"><div className="n">{mastered.length}</div><div className="l">Mastered / maintenance</div></div>
        <div className="card tile"><div className="n">{completed.length}</div><div className="l">Sessions completed</div></div>
      </div>

      <h2 className="section-title">Goal snapshot</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Goal</th><th scope="col">Domain</th><th scope="col">Latest</th><th scope="col">Trend</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b></td>
                <td>{p.domain ?? "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.last5.at(-1) != null ? `${p.last5.at(-1)}${p.mode === "frequency" ? "/hr" : "%"}` : "—"}</td>
                <td>{ARROW[trendArrow(p.last5)]} <span className="trend">{p.last5.slice(-5).join(" → ")}</span></td>
                <td><span className={`pill ${p.status === "mastered" ? "good" : p.status === "active" ? "accent" : "neutral"}`}>{p.status}</span></td>
              </tr>
            ))}
            {!programs.length ? <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No programs yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Where to go</h2>
      <div className="tiles">
        <Link href={`/clients/${clientId}/run`} className="card tile quick" style={{ textDecoration: "none" }}>
          <div className="l" style={{ marginTop: 0 }}>Work with {`this client`}</div><b>▶ Run Session</b>
        </Link>
        <Link href={`/clients/${clientId}/programs`} className="card tile quick" style={{ textDecoration: "none" }}>
          <div className="l" style={{ marginTop: 0 }}>Change programming</div><b>Programs</b>
        </Link>
        <Link href={`/clients/${clientId}/graphs`} className="card tile quick" style={{ textDecoration: "none" }}>
          <div className="l" style={{ marginTop: 0 }}>See progress</div><b>Graphs</b>
        </Link>
        <Link href={`/clients/${clientId}/supervision`} className="card tile quick" style={{ textDecoration: "none" }}>
          <div className="l" style={{ marginTop: 0 }}>Review the case</div><b>Case Review</b>
        </Link>
        <Link href={`/clients/${clientId}/report`} className="card tile quick" style={{ textDecoration: "none" }}>
          <div className="l" style={{ marginTop: 0 }}>Write a report</div><b>Reports</b>
        </Link>
      </div>
    </div>
  );
}
