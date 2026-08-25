"use client";

import * as React from "react";
import Link from "next/link";
import { getClients, getTodaySessions } from "@/lib/data";
import type { ClientRow, ScheduledSession } from "@/lib/types";

export default function TodayPage() {
  const [sessions, setSessions] = React.useState<ScheduledSession[]>([]);
  const [clients, setClients] = React.useState<ClientRow[]>([]);
  React.useEffect(() => {
    void getTodaySessions().then(setSessions);
    void getClients().then(setClients);
  }, []);

  const active = clients.filter((c) => c.status === "active").length;
  const goals = clients.reduce((s, c) => s + c.activeGoals, 0);

  return (
    <div>
      <h1 className="h-page">Today</h1>
      <p className="sub">Your sessions and caseload at a glance. Start a session to begin collecting.</p>

      <div className="tiles" style={{ marginTop: 20 }}>
        <div className="card tile"><div className="n">{sessions.length}</div><div className="l">Sessions today</div></div>
        <div className="card tile"><div className="n">{active}</div><div className="l">Active clients</div></div>
        <div className="card tile"><div className="n">{goals}</div><div className="l">Active goals</div></div>
      </div>

      <h2 className="section-title">Today&rsquo;s sessions</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Time</th><th>Client</th><th>Type</th><th>Location</th><th>Status</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{s.time}</td>
                <td><b>{s.clientName}</b></td>
                <td>{s.type}</td>
                <td>{s.location}</td>
                <td><span className={`pill ${s.status === "completed" ? "good" : "accent"}`}>{s.status}</span></td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/session/${s.id}`} className="btn" style={{ textDecoration: "none" }}>
                    Start session
                  </Link>
                </td>
              </tr>
            ))}
            {!sessions.length ? (
              <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No sessions scheduled today.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
