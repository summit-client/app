"use client";

import * as React from "react";
import {
  IS_PREVIEW, derivePending, getPeople, getSchedulerResources, getStuckSessions,
  linkStaffToEmployment, type Person, type SchedulerResource, type StuckSession,
} from "@/lib/workforce";

/**
 * Workforce — where the scheduler's roster and the platform's people are
 * reconciled, and where sessions that could not be attributed get cleared.
 *
 * This screen exists because the platform deliberately refuses to guess. Two
 * systems each hold a list of the same humans under different keys, and
 * matching them by name would eventually pay one person for another's hours.
 * So it is done once, here, by somebody who knows the roster.
 */
export function WorkforceSection() {
  const [people, setPeople] = React.useState<Person[]>([]);
  const [resources, setResources] = React.useState<SchedulerResource[]>([]);
  const [stuck, setStuck] = React.useState<StuckSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, s] = await Promise.all([getPeople(), getSchedulerResources(), getStuckSessions()]);
      setPeople(p); setResources(r); setStuck(s); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the workforce.");
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function link(employmentId: string, staffId: number | null) {
    setError(null); setNotice(null);
    try {
      await linkStaffToEmployment(employmentId, staffId);
      await load();
      setNotice(staffId == null ? "Link removed." : "Linked. Sessions booked against that record can now be attributed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not link."); }
  }

  async function runDerivation() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const { derived, stillBlocked } = await derivePending();
      await load();
      setNotice(
        derived === 0 && stillBlocked === 0
          ? "Nothing waiting."
          : `${derived} session${derived === 1 ? "" : "s"} recorded.` +
            (stillBlocked ? ` ${stillBlocked} still blocked — see below.` : ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not run the derivation."); }
    finally { setBusy(false); }
  }

  if (loading) return <p className="sub">Loading…</p>;

  const unlinked = people.filter((p) => p.employmentId && p.staffId == null);
  const noEmployment = people.filter((p) => !p.employmentId);
  const byBlocker = stuck.reduce<Record<string, StuckSession[]>>((acc, s) => {
    (acc[s.blockedBy] ??= []).push(s);
    return acc;
  }, {});
  const ready = byBlocker["ready to derive"]?.length ?? 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {IS_PREVIEW ? <span className="pill warn">Preview data</span> : null}
      {error ? <div className="card card-pad" role="alert" style={{ borderColor: "var(--bad)" }}>{error}</div> : null}
      {notice ? <div className="card card-pad" role="status">{notice}</div> : null}

      {/* --- The link ------------------------------------------------------ */}
      <section className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div>
          <b>Scheduler records and people</b>
          <p className="sub" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>
            The scheduler books sessions against its own roster; everything else —
            credentials, training, timesheets, pay — belongs to a login. Linking the
            two is what lets delivered work be attributed to the person who did it.
            Nothing else can do this: names are not unique and are not always spelled
            the same in both systems, so a match made by software would eventually be
            wrong in a way nobody notices.
          </p>
        </div>

        {unlinked.length ? (
          <p className="sub" style={{ margin: 0, color: "var(--warn)" }}>
            {unlinked.length} {unlinked.length === 1 ? "person is" : "people are"} not
            linked to a scheduler record. Their sessions cannot be attributed.
          </p>
        ) : (
          <p className="sub" style={{ margin: 0, color: "var(--good)" }}>
            Everyone with an employment record is linked.
          </p>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr><Th>Person</Th><Th>Role</Th><Th>Position</Th><Th>Employee no.</Th><Th>Scheduler record</Th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.userId}>
                  <Td><b>{p.fullName}</b></Td>
                  <Td className="sub">{p.role}</Td>
                  <Td className="sub">{p.positionTitle ?? "—"}</Td>
                  <Td className="sub">{p.employeeNumber ?? "—"}</Td>
                  <Td>
                    {!p.employmentId ? (
                      <span className="sub">No employment record</span>
                    ) : (
                      <select
                        className="input"
                        value={p.staffId ?? ""}
                        aria-label={`Scheduler record for ${p.fullName}`}
                        onChange={(e) => link(p.employmentId!, e.target.value === "" ? null : Number(e.target.value))}
                      >
                        <option value="">Not linked</option>
                        {resources
                          .filter((r) => r.claimedBy == null || r.id === p.staffId)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.role ? ` · ${r.role}` : ""}
                            </option>
                          ))}
                      </select>
                    )}
                    {/* A name that does not match is the thing worth seeing before
                        confirming, so it is shown rather than hidden behind a check. */}
                    {p.staffName && p.staffName !== p.fullName ? (
                      <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>
                        scheduler name: {p.staffName}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {noEmployment.length ? (
          <p className="sub" style={{ margin: 0 }}>
            {noEmployment.length} {noEmployment.length === 1 ? "person has" : "people have"} no
            employment record at all ({noEmployment.map((p) => p.fullName).join(", ")}). They can sign
            in, but hold no position, no start date and no time. Record one before they submit time.
          </p>
        ) : null}

        {resources.some((r) => r.claimedBy == null) ? (
          <p className="sub" style={{ margin: 0 }}>
            Unclaimed scheduler records:{" "}
            {resources.filter((r) => r.claimedBy == null).map((r) => r.name).join(", ")}. A record
            nobody claims is either a person who has not been set up yet, or a placeholder the
            schedule uses that is not a person at all.
          </p>
        ) : null}
      </section>

      {/* --- The queue ----------------------------------------------------- */}
      <section className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <b>Sessions waiting to be recorded</b>
            <p className="sub" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>
              A delivered session becomes a time entry, and where the work is billable and
              funded, a charge on the family&apos;s budget. Sessions the platform could not
              attribute are held here with the reason, rather than recorded against a guess.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: "auto" }}
            onClick={runDerivation}
            disabled={busy || ready === 0}
          >
            {busy ? "Recording…" : ready ? `Record ${ready} session${ready === 1 ? "" : "s"}` : "Nothing ready"}
          </button>
        </div>

        {stuck.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Every delivered session has been recorded.</p>
        ) : (
          Object.entries(byBlocker)
            .sort(([a], [b]) => (a === "ready to derive" ? -1 : b === "ready to derive" ? 1 : a.localeCompare(b)))
            .map(([reason, rows]) => (
              <div key={reason} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span className={`pill ${reason === "ready to derive" ? "good" : "warn"}`}>{rows.length}</span>
                  <b style={{ fontSize: 13 }}>
                    {reason === "ready to derive" ? "Ready to record" : capitalize(reason)}
                  </b>
                </div>
                <p className="sub" style={{ margin: 0, fontSize: 12 }}>
                  {reason === "staff member is not linked to an employment record"
                    ? "Fix by linking the scheduler record above."
                    : reason === "client has no open budget for that date"
                    ? "Fix on the client's Funding tab, or leave it: the hours are still recorded, only the charge is held."
                    : reason === "ready to derive"
                    ? "Nothing is blocking these."
                    : reason}
                </p>
                <div className="sub" style={{ fontSize: 12 }}>
                  {rows.slice(0, 6).map((s) => `${s.sessionDate} ${s.type ?? "session"}`).join(" · ")}
                  {rows.length > 6 ? ` · and ${rows.length - 6} more` : ""}
                </div>
              </div>
            ))
        )}
      </section>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--line)",
      fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase",
      color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap",
    }}>{children}</th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={className} style={{
      padding: "10px 12px", borderBottom: "1px solid var(--line-soft, var(--line))", verticalAlign: "top",
    }}>{children}</td>
  );
}
