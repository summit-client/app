"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { eventsForSession, getNote, hydrateClientHistory, incidentsFor, runSessionsFor, summariesFor } from "@/lib/data";

interface TimelineItem { date: string; kind: string; pill: string; text: string }

/** Timeline — the client's clinical history in one stream, newest first. */
export default function TimelinePage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [items, setItems] = React.useState<TimelineItem[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const build = React.useCallback(() => {
    const out: TimelineItem[] = [];
    for (const s of runSessionsFor(clientId)) {
      const when = (s.endTime ?? s.startTime ?? s.createdAt).slice(0, 10);
      if (s.status === "completed" || s.status === "locked") {
        const sums = summariesFor(s.id);
        out.push({
          date: when, kind: "Session", pill: "good",
          text: `Session #${s.id} completed — ${sums.length} programs, ${eventsForSession(s.id).length} observations${s.actualDurationMin ? `, ${s.actualDurationMin} min` : ""}.`,
        });
        const note = getNote(s.id);
        if (note && note.status !== "draft") {
          out.push({ date: when, kind: "Documentation", pill: "accent", text: `SOAP note ${note.status.replace(/_/g, " ")} (code ${note.billableCode}).` });
        }
      } else {
        out.push({ date: when, kind: "Session", pill: "warn", text: `Session #${s.id} in ${s.status}.` });
      }
    }
    for (const i of incidentsFor(clientId)) {
      out.push({ date: i.occurredAt.slice(0, 10), kind: "Behaviour", pill: "danger", text: `ABC incident: ${i.behaviour}` });
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    setItems(out);
  }, [clientId]);

  React.useEffect(() => {
    let cancelled = false;
    hydrateClientHistory(clientId)
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load this client's full history."); })
      .finally(() => { if (!cancelled) build(); });
    return () => { cancelled = true; };
  }, [clientId, build]);

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>Sessions, documentation and behaviour events, newest first.</p>
      {loadError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--warn)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{loadError} Showing what this device already has locally.</p>
        </div>
      ) : null}
      <div className="timeline" style={{ marginTop: 14 }}>
        {items.map((it, i) => (
          <div key={i} className="timeline-item">
            <span className="timeline-date">{it.date}</span>
            <span className={`pill ${it.pill}`}>{it.kind}</span>
            <span>{it.text}</span>
          </div>
        ))}
        {!items.length ? (
          <div className="card card-pad"><p className="sub">Nothing yet — completed sessions, notes and incidents will appear here.</p></div>
        ) : null}
      </div>
    </div>
  );
}
