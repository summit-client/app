"use client";

/**
 * Read-only caseload calendar: the signed-in clinician's own upcoming
 * sessions across every client on their caseload, in one view, inside this
 * portal — so a clinician can see their whole week/month without being sent
 * to apps/scheduler (the family-of-apps that owns booking/editing sessions).
 *
 * Deliberately not apps/scheduler's TimeGrid/MonthGrid: those are built for
 * editing (drag-to-reschedule, click-to-create, conflict/gap detection,
 * recurrence-scope modals) — none of which applies here, and reimplementing
 * an hour-by-hour precision grid for a view-only screen is more machinery
 * than this needs. Each day is a simple agenda list of chips instead, sorted
 * by time, which is enough to answer "what do I have, and when" without
 * pretending this is a scheduling tool.
 */

import * as React from "react";
import Link from "next/link";
import { getMyCaseloadSessions } from "@/lib/data";
import {
  addDays, addMonths, computeMonthRange, computeWeekRange, parseDateStr, todayDateStr, toDateStr, WEEKDAY_ABBR,
} from "@/lib/calendar-dates";
import type { CaseloadSession } from "@/lib/types";

type ViewMode = "week" | "month";

const STATUS_PILL: Record<string, string> = {
  scheduled: "accent",
  completed: "good",
  no_show: "danger",
};

export function CaseloadCalendar() {
  const [mode, setMode] = React.useState<ViewMode>("week");
  const [anchor, setAnchor] = React.useState<Date>(() => parseDateStr(todayDateStr()));
  const [loading, setLoading] = React.useState(true);
  const [notLinked, setNotLinked] = React.useState(false);
  const [sessions, setSessions] = React.useState<CaseloadSession[]>([]);

  const range = React.useMemo(
    () => (mode === "week" ? computeWeekRange(anchor) : computeMonthRange(anchor)),
    [mode, anchor],
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMyCaseloadSessions(range.queryStart, range.queryEnd).then((result) => {
      if (cancelled) return;
      if (result.status === "not_linked") {
        setNotLinked(true);
        setSessions([]);
      } else {
        setNotLinked(false);
        setSessions(result.sessions);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range.queryStart, range.queryEnd]);

  function go(direction: 1 | -1) {
    setAnchor((a) => (mode === "week" ? addDays(a, direction * 7) : addMonths(a, direction)));
  }
  function goToday() {
    setAnchor(parseDateStr(todayDateStr()));
  }

  const today = todayDateStr();

  if (notLinked) {
    return (
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>No scheduler resource linked</h2>
        <p className="sub" style={{ marginTop: 8 }}>
          Your account isn&rsquo;t linked to a scheduler resource yet, so no booked sessions can be shown here.
          Ask an administrator to link your employment record to your scheduler entry.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button aria-label="Previous" onClick={() => go(-1)} className="btn secondary">‹</button>
          <button onClick={goToday} className="btn secondary">Today</button>
          <button aria-label="Next" onClick={() => go(1)} className="btn secondary">›</button>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Calendar view" style={{ marginLeft: 4 }}>
          {(["week", "month"] as const).map((v) => (
            <button
              key={v} role="tab" aria-selected={mode === v}
              className={`mode-tab ${mode === v ? "active" : ""}`}
              onClick={() => setMode(v)}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <span className="sub" style={{ marginTop: 0, marginLeft: 4 }}>{range.label}</span>
      </div>

      {loading ? (
        <p className="sub">Loading your schedule…</p>
      ) : mode === "week" ? (
        <WeekAgenda days={range.days} sessions={sessions} today={today} />
      ) : (
        <MonthAgenda days={range.days} sessions={sessions} today={today} monthIdx={(range as ReturnType<typeof computeMonthRange>).monthIdx} />
      )}
    </div>
  );
}

function SessionChip({ s }: { s: CaseloadSession }) {
  return (
    <Link
      href={`/clients/${s.clientId}`}
      className="caseload-cal-chip"
      title={`${s.clientName} — ${s.type} at ${s.time}`}
      style={{ textDecoration: "none" }}
    >
      <span className="caseload-cal-chip-time">{s.time}</span>
      <span className="caseload-cal-chip-client">{s.clientName}</span>
      <span className="caseload-cal-chip-type">{s.type}</span>
      <span className={`pill ${STATUS_PILL[s.status] ?? "neutral"} caseload-cal-chip-pill`}>{s.status.replace("_", " ")}</span>
    </Link>
  );
}

function WeekAgenda({ days, sessions, today }: { days: Date[]; sessions: CaseloadSession[]; today: string }) {
  return (
    <div className="caseload-cal-week">
      {days.map((d) => {
        const dateStr = toDateStr(d);
        const daySessions = sessions.filter((s) => s.date === dateStr);
        const isToday = dateStr === today;
        return (
          <div key={dateStr} className={`card caseload-cal-day ${isToday ? "is-today" : ""}`}>
            <div className="caseload-cal-day-head">
              <span>{WEEKDAY_ABBR[d.getDay()]}</span>
              <span className={isToday ? "caseload-cal-day-num is-today" : "caseload-cal-day-num"}>{d.getDate()}</span>
            </div>
            <div className="caseload-cal-day-body">
              {daySessions.length ? (
                daySessions.map((s) => <SessionChip key={s.id} s={s} />)
              ) : (
                <span className="sub" style={{ fontSize: 12 }}>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthAgenda({ days, sessions, today, monthIdx }: { days: Date[]; sessions: CaseloadSession[]; today: string; monthIdx: number }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const MAX_CHIPS = 3;
  return (
    <div className="caseload-cal-month">
      {WEEKDAY_ABBR.map((d) => (
        <div key={d} className="caseload-cal-month-hd">{d}</div>
      ))}
      {days.map((d) => {
        const dateStr = toDateStr(d);
        const daySessions = sessions.filter((s) => s.date === dateStr);
        const inMonth = d.getMonth() === monthIdx;
        const isToday = dateStr === today;
        const isOpen = expanded === dateStr;
        const chips = isOpen ? daySessions : daySessions.slice(0, MAX_CHIPS);
        const hidden = daySessions.length - chips.length;
        return (
          <div key={dateStr} className={`caseload-cal-month-cell ${inMonth ? "" : "is-out"}`}>
            <div className={isToday ? "caseload-cal-day-num is-today" : "caseload-cal-day-num"}>{d.getDate()}</div>
            {chips.map((s) => (
              <Link key={s.id} href={`/clients/${s.clientId}`} className="caseload-cal-month-chip" title={`${s.clientName} — ${s.type} at ${s.time}`} style={{ textDecoration: "none" }}>
                <span className="caseload-cal-month-chip-time">{s.time.replace(" AM", "a").replace(" PM", "p")}</span>
                <span>{s.clientName}</span>
              </Link>
            ))}
            {hidden > 0 && (
              <button className="caseload-cal-month-more" onClick={() => setExpanded(dateStr)}>+{hidden} more</button>
            )}
            {isOpen && daySessions.length > MAX_CHIPS && (
              <button className="caseload-cal-month-more" onClick={() => setExpanded(null)}>Show less</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
