"use client";

import * as React from "react";
import Link from "next/link";
import { urlFor } from "@summit/portals";
import { getMyClients } from "@/lib/data";
import type { ClientRow } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  active: "good", intake: "accent", maintenance: "neutral", waitlist: "warn",
};

/**
 * This clinician's own caseload, scoped server-side (getMyClients() filters
 * by client_sessions.clinician_id under RLS — see its doc comment in
 * lib/data.ts for why that's the relationship used and what it doesn't
 * cover yet). Not a client picker: there is no control anywhere on this
 * screen to browse clients outside this list.
 */
export default function CaseloadPage() {
  const [clients, setClients] = React.useState<ClientRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getMyClients()
      .then((cs) => { if (!cancelled) setClients(cs); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load your caseload."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Scheduler has no per-client filter it can be linked into (no URL param
  // it reads for one) — this opens its Sessions view, the closest existing
  // destination, not a pre-filtered one. See lib/data.ts's getMyClients()
  // doc comment and the PR description for the full reasoning.
  const scheduleHref = `${urlFor("scheduler")}/?view=sessions`;

  return (
    <div>
      <h1 className="h-page">My Caseload</h1>
      <p className="sub">Clients you have documented at least one session with. Open a client, or jump straight to their goals, notes or schedule.</p>

      {loadError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--warn)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{loadError}</p>
        </div>
      ) : null}

      <div className="card table-wrap" style={{ marginTop: 20 }}>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Goals</th>
              <th scope="col">Next session</th>
              <th scope="col">Status</th>
              <th aria-label="Quick links" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/clients/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <b>{c.name}</b>
                  </Link>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {c.activeGoals} active · {c.masteredGoals} mastered
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.nextSession ?? "—"}</td>
                <td><span className={`pill ${STATUS_PILL[c.status] ?? "neutral"}`}>{c.status}</span></td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Link href={`/clients/${c.id}/goals`} className="btn ghost" style={{ textDecoration: "none" }}>
                      Goals
                    </Link>
                    <Link href={`/clients/${c.id}/sessions`} className="btn ghost" style={{ textDecoration: "none" }}>
                      Notes
                    </Link>
                    <a
                      href={scheduleHref} target="_blank" rel="noreferrer"
                      className="btn ghost" style={{ textDecoration: "none" }}
                      title="Opens the scheduler's Sessions view — not yet filterable to one client from here"
                    >
                      Schedule ↗
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !clients.length && !loadError ? (
              <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No clients yet — clients appear here once you've documented a session with them.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
