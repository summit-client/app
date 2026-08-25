"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { eventsForSession, getNote, incidentsFor, runSessionsFor, summariesFor } from "@/lib/data";
import type { RunSession } from "@/lib/types";

const STATUS_PILL: Record<RunSession["status"], string> = {
  planning: "neutral", active: "accent", documentation: "warn", completed: "good", locked: "good",
};

/** Session history for this client — every run session with its status and note. */
export default function SessionsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [sessions, setSessions] = React.useState<RunSession[]>([]);

  React.useEffect(() => {
    setSessions(runSessionsFor(clientId));
  }, [clientId]);

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        planning → active → documentation → completed → locked. A session locks when its note is countersigned; locked sessions are immutable.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {sessions.map((s) => {
          const sums = summariesFor(s.id);
          const obs = eventsForSession(s.id).length;
          const abc = incidentsFor(clientId).length;
          const note = getNote(s.id);
          return (
            <div key={s.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <b>Session #{s.id}</b>
                  <span className="sub" style={{ marginLeft: 10 }}>
                    {(s.endTime ?? s.startTime ?? s.createdAt).slice(0, 10)} · {s.serviceType ?? "Session"} · {s.location ?? "—"}
                    {s.actualDurationMin != null ? ` · ${s.actualDurationMin} min` : s.plannedDurationMin != null ? ` · planned ${s.plannedDurationMin} min` : ""}
                  </span>
                </div>
                <span className={`pill ${STATUS_PILL[s.status]}`}>{s.status}</span>
              </div>
              <p className="trend" style={{ marginTop: 8 }}>
                {sums.length} programs addressed · {obs} atomic observations{abc ? ` · ${abc} ABC entries` : ""} ·
                note: <b>{note ? note.status.replace(/_/g, " ") : "—"}</b>
              </p>
              {["planning", "active", "documentation"].includes(s.status) ? (
                <div style={{ marginTop: 10 }}>
                  <Link href={`/clients/${clientId}/run`} className="btn" style={{ textDecoration: "none" }}>
                    {s.status === "active" ? "Resume session" : s.status === "documentation" ? "Finish documentation" : "Continue planning"}
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
        {!sessions.length ? (
          <div className="card card-pad">
            <p className="sub">No sessions on this device yet.</p>
            <Link href={`/clients/${clientId}/run`} className="btn" style={{ textDecoration: "none", marginTop: 10, display: "inline-block" }}>▶ Run Session</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
