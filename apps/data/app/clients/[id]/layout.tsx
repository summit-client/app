"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { getClients, getPrograms, hydrateClientHistory, openSessionFor, runSessionsFor } from "@/lib/data";
import { useTerm } from "@/components/portal-chrome";
import type { ClientRow, Program } from "@/lib/types";

/**
 * The client page is the clinical home: every workflow — running a session,
 * changing programming, reading graphs, reviewing the case, writing a report —
 * originates from this one record. The header's Run Session button launches a
 * session already bound to this client; the clinician never re-selects them.
 */

/** Tab labels resolve through the central terminology settings. */
function useTabs() {
  const t = useTerm();
  const s = (name: string) => (t(name).endsWith("s") ? t(name) : `${t(name)}s`);
  return [
    { seg: "", label: "Overview" },
    { seg: "run", label: `Run ${t("session")}` },
    { seg: "programs", label: s("program") },
    { seg: "goals", label: s("goal") },
    { seg: "graphs", label: "Graphs" },
    { seg: "sessions", label: s("session") },
    { seg: "planning", label: "Treatment Plan" },
    { seg: "assessments", label: "Assessments" },
    { seg: "documents", label: "Documents" },
    { seg: "timeline", label: "Timeline" },
    { seg: "supervision", label: "Case Review" },
    { seg: "report", label: "Report" },
  ];
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const TABS = useTabs();
  const clientId = Number(params.id);
  const [client, setClient] = React.useState<ClientRow | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    void getClients().then((cs) => setClient(cs.find((c) => c.id === clientId) ?? null));
    void getPrograms(clientId).then(setPrograms);
  }, [clientId, pathname]);

  // Session state lives in the mirror; re-hydrate it from the client's real
  // session history (not just this browser's own) and re-read whenever the
  // route (or a child action) changes.
  React.useEffect(() => {
    let cancelled = false;
    hydrateClientHistory(clientId)
      .catch(() => { /* best-effort — the mirror still shows at least this device's own sessions */ })
      .finally(() => { if (!cancelled) setTick((t) => t + 1); });
    return () => { cancelled = true; };
  }, [clientId, pathname]);

  const open = openSessionFor(clientId);
  const lastCompleted = runSessionsFor(clientId).find((s) => s.status === "completed" || s.status === "locked");
  const activeGoals = programs.filter((p) => p.status === "active").length;
  void tick;
  const current = pathname.replace(/\/$/, "").split("/")[3] ?? "";

  if (!client) return <p className="sub">Loading client…</p>;

  return (
    <div>
      <div className="client-header card card-pad">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="h-page">{client.name}</h1>
          <p className="sub" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {client.supervisor ? <span>Supervisor: <b style={{ color: "var(--ink)" }}>{client.supervisor}</b></span> : null}
            <span>Last session: <b style={{ color: "var(--ink)" }}>{lastCompleted?.endTime?.slice(0, 10) ?? client.lastSession ?? "—"}</b></span>
            <span><b style={{ color: "var(--ink)" }}>{activeGoals}</b> active goals</span>
            <span className="pill accent">{client.status}</span>
          </p>
        </div>
        <Link href={`/clients/${clientId}/run`} className={`btn lg run-cta ${open?.status === "active" ? "live" : ""}`} style={{ textDecoration: "none" }}>
          {open?.status === "active" ? "● Session in progress" : open ? "▶ Resume session" : "▶ Run Session"}
        </Link>
      </div>

      <nav className="client-tabs" aria-label="Client record">
        {TABS.map((t) => (
          <Link
            key={t.seg}
            href={`/clients/${clientId}${t.seg ? `/${t.seg}` : ""}`}
            className={`client-tab ${current === t.seg ? "active" : ""} ${t.seg === "run" ? "emph" : ""}`}
            aria-current={current === t.seg ? "page" : undefined}
          >
            {t.seg === "run" ? "▶ " : ""}{t.label}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  );
}
