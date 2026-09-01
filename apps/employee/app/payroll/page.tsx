"use client";

/**
 * My Pay — hours, overtime and timesheet status for the signed-in employee.
 *
 * Read-mostly by design. The one action is submitting a period for approval;
 * nothing on this screen edits an hour, because hours come from delivered
 * sessions (migration 0031) rather than being typed, and a screen that let
 * someone retype them would create a second answer.
 *
 * Everything here is the caller's own record. RLS enforces that; the queries
 * filter on it as well.
 */

import * as React from "react";
import { HubGate } from "@/components/hub-provider";
import { useIdentity } from "@/components/session-provider";
import {
  IS_PREVIEW, entriesInPeriod, hours, money, payrollBackend, totalsFor, weeksInPeriod,
  type PayPeriod, type PayrollSnapshot, type TimesheetStatus,
} from "@/lib/payroll";

export default function PayrollPage() {
  return (
    <HubGate>
      <Payroll />
    </HubGate>
  );
}

const STATUS_PILL: Record<TimesheetStatus, string> = {
  DRAFT: "neutral", SUBMITTED: "accent", RETURNED: "warn", APPROVED: "good",
};
const STATUS_LABEL: Record<TimesheetStatus, string> = {
  DRAFT: "Not submitted", SUBMITTED: "Submitted, awaiting approval",
  RETURNED: "Returned to you", APPROVED: "Approved",
};

function Payroll() {
  const identity = useIdentity();
  const [snap, setSnap] = React.useState<PayrollSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [periodId, setPeriodId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    payrollBackend(identity)
      .load()
      .then((s) => { setSnap(s); setPeriodId((cur) => cur ?? s.currentPeriodId); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [identity]);

  React.useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="card card-pad" role="alert" style={{ maxWidth: 640 }}>
        <h1 className="h-page">Could not load your pay records</h1>
        <p className="sub" style={{ marginTop: 8 }}>{error}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={load}>Try again</button>
      </div>
    );
  }
  if (!snap) return <p className="sub">Loading your pay…</p>;

  // An account can exist before HR records the employment. Say that, rather
  // than rendering a page of zeroes that reads as "you worked nothing".
  if (!snap.employmentId) {
    return (
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <h1 className="h-page">No employment record yet</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          Your hours and timesheets appear here once your employment record is set up.
          That is done by whoever administers HR for your clinic — ask them to add your
          position and start date.
        </p>
      </div>
    );
  }

  const period = snap.periods.find((p) => p.id === periodId) ?? null;
  const weeks = weeksInPeriod(snap.weeks, period);
  const entries = entriesInPeriod(snap.entries, period);
  const totals = totalsFor(weeks);
  const sheet = snap.timesheets.find((t) => t.payPeriodId === period?.id) ?? null;
  const status: TimesheetStatus = sheet?.status ?? "DRAFT";
  const canSubmit = period?.status === "OPEN" && (status === "DRAFT" || status === "RETURNED");

  async function submit() {
    if (!period) return;
    setBusy(true);
    try { await payrollBackend(identity).submitTimesheet(period.id); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header>
        <h1 className="h-page">My Pay</h1>
        <p className="sub" style={{ maxWidth: "70ch" }}>
          Your recorded hours and their overtime split, by pay period. Hours come from
          delivered sessions and recorded time, not from anything typed here.
        </p>
        {IS_PREVIEW ? <span className="pill warn" style={{ marginTop: 8, display: "inline-block" }}>Preview data</span> : null}
      </header>

      {/* Period picker + timesheet state */}
      <section className="card card-pad" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Pay period</span>
            <select
              id="pay-period" className="input" style={{ width: "auto" }}
              value={period?.id ?? ""} onChange={(e) => setPeriodId(e.target.value)}
            >
              {snap.periods.length === 0 ? <option value="">No pay periods set up</option> : null}
              {snap.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.startsOn} to {p.endsOn}{p.status !== "OPEN" ? ` · ${p.status.toLowerCase()}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>Timesheet</div>
            <span className={`pill ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
          </div>

          {period?.payDate ? (
            <div>
              <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>Pay date</div>
              <b>{period.payDate}</b>
            </div>
          ) : null}

          {canSubmit ? (
            <button className="btn" style={{ marginLeft: "auto" }} onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Submit for approval"}
            </button>
          ) : null}
        </div>

        {status === "RETURNED" && sheet?.returnReason ? (
          <div className="card card-pad" role="alert" style={{ borderColor: "var(--warn)" }}>
            <b>Returned for a change.</b>{" "}
            <span className="sub">{sheet.returnReason}</span>
          </div>
        ) : null}

        {status === "APPROVED" ? (
          <p className="sub" style={{ margin: 0 }}>
            Approved{sheet?.approvedAt ? ` on ${sheet.approvedAt.slice(0, 10)}` : ""}. A change
            after approval is an adjustment in the next period, not an edit to this one.
          </p>
        ) : null}
      </section>

      {/* Totals */}
      <section className="card card-pad">
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Figure label="Hours worked" value={totals.workedHours} />
          <Figure label="Regular" value={totals.regularHours} />
          <Figure label="Overtime" value={totals.overtimeHours} tone={totals.overtimeHours > 0 ? "accent" : undefined} />
          <Figure label="Paid, not worked" value={totals.nonWorkedHours} hint="vacation, holiday, sick" />
          {snap.hourlyRate != null ? (
            <Figure
              label={snap.rateBasis === "annual_salary" ? "Salary" : "Your rate"}
              value={snap.rateBasis === "annual_salary"
                ? money(snap.hourlyRate)
                : `${money(snap.hourlyRate)}/hr`}
              raw
            />
          ) : null}
        </div>

        {totals.anyProvisional ? (
          <p className="sub" style={{ marginTop: 14, color: "var(--warn)" }}>
            Your employment type has not been confirmed yet, so the split between regular
            and overtime here is provisional. The hours themselves are correct. Ask HR to
            confirm your position before this period is paid.
          </p>
        ) : null}

        <p className="sub" style={{ marginTop: 12, fontSize: 12 }}>
          These are gross hours. Income tax, CPP and EI are calculated by the payroll
          provider, not here, so nothing on this page is a net figure.
        </p>
      </section>

      {/* Per work week — the unit overtime is actually computed over */}
      <section className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>By work week</b>
          <p className="sub" style={{ margin: "4px 0 0", maxWidth: "70ch" }}>
            Overtime is worked out over your employer&apos;s declared seven-day work week,
            not over the pay period. Two weeks of 60 and 20 hours is 16 hours of overtime,
            even though the period totals 80.
          </p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Week beginning</th>
              <th style={{ textAlign: "right" }}>Worked</th>
              <th style={{ textAlign: "right" }}>Regular</th>
              <th style={{ textAlign: "right" }}>Overtime</th>
              <th style={{ textAlign: "right" }}>Paid, not worked</th>
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 ? (
              <tr><td colSpan={5} className="sub" style={{ textAlign: "center", padding: 24 }}>
                No hours recorded in this period.
              </td></tr>
            ) : weeks.map((w) => (
              <tr key={w.workWeekStart}>
                <td>
                  <b>{w.workWeekStart}</b>
                  {w.overtimeExempt ? (
                    <span className="sub" style={{ fontSize: 11 }}> · exempt position</span>
                  ) : null}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{w.workedHours}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{w.regularHours}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: w.overtimeHours ? 700 : 400 }}>
                  {w.overtimeHours}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{w.nonWorkedHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* The atoms */}
      <section className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>Time recorded</b>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            Entries marked <i>from a session</i> were created automatically when the session
            was marked delivered.
          </p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th><th>Activity</th>
              <th style={{ textAlign: "right" }}>Hours</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={4} className="sub" style={{ textAlign: "center", padding: 24 }}>
                Nothing recorded in this period yet.
              </td></tr>
            ) : entries.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{e.workDate}</td>
                <td>
                  {e.activityLabel}
                  {!e.countsAsWorked ? <span className="sub" style={{ fontSize: 11 }}> · not worked time</span> : null}
                  {e.note ? <div className="sub" style={{ fontSize: 11 }}>{e.note}</div> : null}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{hours(e.minutes)}</td>
                <td className="sub">{e.fromSession ? "from a session" : "entered"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Figure({ label, value, hint, tone, raw }: {
  label: string; value: string | number; hint?: string; tone?: "accent"; raw?: boolean;
}) {
  return (
    <div>
      <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}{hint ? <span style={{ fontWeight: 400 }}> · {hint}</span> : null}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: tone === "accent" ? "var(--accent)" : "var(--ink)",
      }}>
        {value}{raw ? "" : <span style={{ fontSize: 13, fontWeight: 400 }}> h</span>}
      </div>
    </div>
  );
}
