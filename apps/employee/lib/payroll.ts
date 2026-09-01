"use client";

/**
 * My Pay — the employee's own view of their hours, overtime and timesheet.
 *
 * Same two-implementations-of-one-interface shape as hub-backend.ts and
 * hr-backend.ts, for the same reason: one live path and one preview path that
 * cannot drift, because a missing implementation is a type error.
 *
 * WHERE THE ARITHMETIC LIVES
 *
 * Not here. `employee_work_weeks` (migration 0033) does the ESA overtime split
 * in SQL, and this reads the answer. There is a second implementation of the
 * same rules in `packages/workforce/esa.ts` for screens that need to compute
 * before saving — this screen does not, it only reports what was recorded, so
 * a third copy of the rules would be a third opportunity to disagree.
 *
 * That package is deliberately NOT a dependency of this app: adding one would
 * mean touching package.json and the lockfile. The preview fixtures below do
 * the small amount of arithmetic they need inline, and are clearly fixtures.
 *
 * WHAT THIS DELIBERATELY DOES NOT SHOW
 *
 * Net pay. There is none to show. Income tax, CPP and EI withholding belong to
 * the payroll provider; this platform produces gross hours by pay code and
 * hands them over. Every figure on this screen is hours or gross, and the
 * screen says so rather than letting someone read a net figure into it.
 *
 * Client names. A time entry derived from a delivered session carries a
 * client_id, and this screen never asks for it. The employee already knows who
 * they saw; putting a client's identity on a payroll screen would put PHI
 * somewhere it has no reason to be.
 */

import { createBrowserClient } from "@supabase/ssr";
import { IS_PREVIEW, type Session } from "./session";

export { IS_PREVIEW };

export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
export type PeriodStatus = "OPEN" | "LOCKED" | "EXPORTED";

export interface PayPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  payDate: string | null;
  status: PeriodStatus;
}

export interface Timesheet {
  id: string;
  payPeriodId: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

/** One declared work week, as `employee_work_weeks` derives it. */
export interface WorkWeek {
  workWeekStart: string;
  workedHours: number;
  nonWorkedHours: number;
  productiveHours: number;
  billableHours: number;
  regularHours: number;
  overtimeHours: number;
  overtimeExempt: boolean;
  /**
   * The employment terms behind the split were assumed by a backfill rather
   * than recorded (migration 0033). Hours are still real; the overtime split
   * is not to be paid against until someone confirms the employment type.
   */
  termsProvisional: boolean;
}

export interface TimeEntryRow {
  id: string;
  workDate: string;
  minutes: number;
  activityCode: string;
  activityLabel: string;
  billable: boolean;
  countsAsWorked: boolean;
  note: string | null;
  fromSession: boolean;
}

export interface PayrollSnapshot {
  /** Null when the signed-in person has no employment record yet. */
  employmentId: string | null;
  positionTitle: string | null;
  employmentType: string | null;
  /** Their own rate. RLS permits own-rate only; a colleague's never arrives. */
  hourlyRate: number | null;
  rateBasis: "hourly" | "annual_salary" | null;
  periods: PayPeriod[];
  currentPeriodId: string | null;
  timesheets: Timesheet[];
  weeks: WorkWeek[];
  entries: TimeEntryRow[];
}

export interface PayrollBackend {
  load(): Promise<PayrollSnapshot>;
  submitTimesheet(periodId: string): Promise<void>;
}

/* ---- errors: same shape as the other two stores ---------------------------- */

function describe(c: unknown): string {
  if (typeof c === "object" && c && "message" in c) return String((c as { message: unknown }).message);
  return String(c);
}

export class PayrollReadError extends Error {
  constructor(readonly what: string, cause: unknown) {
    super(`Could not load ${what}: ${describe(cause)}`);
    this.name = "PayrollReadError";
  }
}

export class PayrollWriteError extends Error {
  constructor(readonly operation: string, cause: unknown) {
    super(`Could not save (${operation}): ${describe(cause)}`);
    this.name = "PayrollWriteError";
  }
}

function firstReadError(results: [string, { error: unknown }][]): void {
  for (const [what, res] of results) {
    if (res.error) throw new PayrollReadError(what, res.error);
  }
}

function ok(op: string, res: { error: unknown }): void {
  if (res.error) throw new PayrollWriteError(op, res.error);
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/* ---- preview backend ------------------------------------------------------- */

/** Local calendar date, never a UTC round trip. See lib/hub.ts's note. */
function toCalendarDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function previewSnapshot(): PayrollSnapshot {
  const today = new Date();
  // A two-week period containing today, starting on a Sunday.
  const periodStart = new Date(today);
  periodStart.setDate(periodStart.getDate() - periodStart.getDay() - 7);
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 13);
  const payDate = new Date(periodEnd);
  payDate.setDate(payDate.getDate() + 5);

  const weekTwo = new Date(periodStart);
  weekTwo.setDate(weekTwo.getDate() + 7);

  const entryOn = (offset: number, hours: number, code: string, label: string, billable: boolean) => {
    const d = new Date(periodStart);
    d.setDate(d.getDate() + offset);
    return {
      id: `pv-e${offset}-${code}`,
      workDate: toCalendarDate(d),
      minutes: Math.round(hours * 60),
      activityCode: code,
      activityLabel: label,
      billable,
      countsAsWorked: code !== "HOLIDAY",
      note: null,
      fromSession: billable,
      fromSessionLabel: null,
    } as TimeEntryRow;
  };

  return {
    employmentId: "pv-employment",
    positionTitle: "Behaviour Therapist",
    employmentType: "full_time",
    hourlyRate: 34.5,
    rateBasis: "hourly",
    periods: [{
      id: "pv-period",
      startsOn: toCalendarDate(periodStart),
      endsOn: toCalendarDate(periodEnd),
      payDate: toCalendarDate(payDate),
      status: "OPEN",
    }],
    currentPeriodId: "pv-period",
    timesheets: [{
      id: "pv-sheet", payPeriodId: "pv-period", status: "DRAFT",
      submittedAt: null, approvedAt: null, returnedAt: null, returnReason: null,
    }],
    weeks: [
      {
        workWeekStart: toCalendarDate(periodStart),
        workedHours: 38.5, nonWorkedHours: 0, productiveHours: 29, billableHours: 29,
        regularHours: 38.5, overtimeHours: 0, overtimeExempt: false, termsProvisional: false,
      },
      {
        workWeekStart: toCalendarDate(weekTwo),
        workedHours: 47, nonWorkedHours: 7.5, productiveHours: 34, billableHours: 34,
        regularHours: 44, overtimeHours: 3, overtimeExempt: false, termsProvisional: false,
      },
    ],
    entries: [
      entryOn(1, 6.5, "DIRECT", "Direct therapy", true),
      entryOn(1, 1, "NOTES", "Documentation", false),
      entryOn(2, 7, "DIRECT", "Direct therapy", true),
      entryOn(3, 6, "DIRECT", "Direct therapy", true),
      entryOn(3, 1.5, "SUPERV_RECV", "Supervision received", false),
      entryOn(4, 7.5, "DIRECT", "Direct therapy", true),
      entryOn(8, 8, "DIRECT", "Direct therapy", true),
      entryOn(9, 7.5, "HOLIDAY", "Public holiday", false),
    ],
  };
}

export function previewBackend(): PayrollBackend {
  let snap = previewSnapshot();
  return {
    async load() { return snap; },
    async submitTimesheet(periodId) {
      snap = {
        ...snap,
        timesheets: snap.timesheets.map((t) =>
          t.payPeriodId === periodId
            ? { ...t, status: "SUBMITTED" as TimesheetStatus, submittedAt: new Date().toISOString() }
            : t),
      };
    },
  };
}

/* ---- Supabase backend ------------------------------------------------------ */

export function supabaseBackend(session: Session): PayrollBackend {
  const uid = session.userId;

  return {
    async load(): Promise<PayrollSnapshot> {
      const db = sb();

      // The employment record is the key everything else hangs off. RLS on
      // employment_records already restricts this to the caller's own file;
      // the user_id filter is defence in depth, matching every other read in
      // this app.
      const employment = await db
        .from("employment_records")
        .select("id, user_id, start_date")
        .eq("user_id", uid)
        .is("end_date", null)
        .maybeSingle();
      firstReadError([["your employment record", employment]]);

      const employmentId = (employment.data?.id as string | undefined) ?? null;
      if (!employmentId) {
        // Not an error: a person can hold an account before HR records their
        // employment. The screen explains this rather than showing zeroes.
        return {
          employmentId: null, positionTitle: null, employmentType: null,
          hourlyRate: null, rateBasis: null,
          periods: [], currentPeriodId: null, timesheets: [], weeks: [], entries: [],
        };
      }

      const [position, rate, periods, sheets, weeks, entries, activities] = await Promise.all([
        db.from("current_employment")
          .select("position_title, employment_type")
          .eq("employment_id", employmentId).maybeSingle(),
        db.from("pay_rates")
          .select("basis, amount, effective_from")
          .eq("employment_id", employmentId)
          .order("effective_from", { ascending: false })
          .limit(1).maybeSingle(),
        db.from("pay_periods")
          .select("id, starts_on, ends_on, pay_date, status")
          .order("starts_on", { ascending: false }).limit(12),
        db.from("timesheets")
          .select("id, pay_period_id, status, submitted_at, approved_at, returned_at, return_reason")
          .eq("employment_id", employmentId),
        db.from("employee_work_weeks")
          .select("work_week_start, worked_hours, non_worked_hours, productive_hours, billable_hours, regular_hours, overtime_hours, overtime_exempt, terms_provisional")
          .eq("employment_id", employmentId)
          .order("work_week_start", { ascending: false }).limit(26),
        db.from("time_entries")
          .select("id, work_date, minutes, activity_code_id, note, session_id")
          .eq("employment_id", employmentId)
          .order("work_date", { ascending: false }).limit(400),
        db.from("activity_codes").select("id, code, label, billable, counts_as_worked"),
      ]);

      firstReadError([
        ["your position", position],
        ["your pay rate", rate],
        ["pay periods", periods],
        ["your timesheets", sheets],
        ["your hours", weeks],
        ["your time entries", entries],
        ["the activity list", activities],
      ]);

      const activityById = new Map(
        (activities.data ?? []).map((a) => [a.id as string, a]),
      );

      const periodRows: PayPeriod[] = (periods.data ?? []).map((p) => ({
        id: p.id as string,
        startsOn: p.starts_on as string,
        endsOn: p.ends_on as string,
        payDate: (p.pay_date as string) ?? null,
        status: p.status as PeriodStatus,
      }));

      // "Current" is the open period containing today, and otherwise the most
      // recent one — so the screen still has something to show between periods.
      const today = toCalendarDate(new Date());
      const containing = periodRows.find((p) => p.startsOn <= today && p.endsOn >= today);
      const currentPeriodId = (containing ?? periodRows[0])?.id ?? null;

      return {
        employmentId,
        positionTitle: (position.data?.position_title as string) ?? null,
        employmentType: (position.data?.employment_type as string) ?? null,
        hourlyRate: rate.data?.amount == null ? null : Number(rate.data.amount),
        rateBasis: (rate.data?.basis as PayrollSnapshot["rateBasis"]) ?? null,
        periods: periodRows,
        currentPeriodId,
        timesheets: (sheets.data ?? []).map((t) => ({
          id: t.id as string,
          payPeriodId: t.pay_period_id as string,
          status: t.status as TimesheetStatus,
          submittedAt: (t.submitted_at as string) ?? null,
          approvedAt: (t.approved_at as string) ?? null,
          returnedAt: (t.returned_at as string) ?? null,
          returnReason: (t.return_reason as string) ?? null,
        })),
        weeks: (weeks.data ?? []).map((w) => ({
          workWeekStart: w.work_week_start as string,
          workedHours: Number(w.worked_hours ?? 0),
          nonWorkedHours: Number(w.non_worked_hours ?? 0),
          productiveHours: Number(w.productive_hours ?? 0),
          billableHours: Number(w.billable_hours ?? 0),
          regularHours: Number(w.regular_hours ?? 0),
          overtimeHours: Number(w.overtime_hours ?? 0),
          overtimeExempt: Boolean(w.overtime_exempt),
          termsProvisional: Boolean(w.terms_provisional),
        })),
        entries: (entries.data ?? []).map((e) => {
          const a = activityById.get(e.activity_code_id as string);
          return {
            id: e.id as string,
            workDate: e.work_date as string,
            minutes: Number(e.minutes),
            activityCode: (a?.code as string) ?? "—",
            activityLabel: (a?.label as string) ?? "Unrecorded activity",
            billable: Boolean(a?.billable),
            countsAsWorked: a?.counts_as_worked !== false,
            note: (e.note as string) ?? null,
            fromSession: e.session_id != null,
          };
        }),
      };
    },

    async submitTimesheet(periodId: string): Promise<void> {
      const db = sb();

      const employment = await db
        .from("employment_records").select("id, clinic_id")
        .eq("user_id", uid).is("end_date", null).maybeSingle();
      firstReadError([["your employment record", employment]]);
      const employmentId = employment.data?.id as string | undefined;
      if (!employmentId) throw new PayrollWriteError("submit", "no employment record on file");

      const existing = await db
        .from("timesheets").select("id, status")
        .eq("employment_id", employmentId).eq("pay_period_id", periodId).maybeSingle();
      firstReadError([["your timesheet", existing]]);

      // A sheet may not exist yet: the first submission creates it. Deliberately
      // not created on load — an unsubmitted period should leave no row, so the
      // approver's queue is submissions rather than everyone who opened a page.
      if (!existing.data) {
        ok("submit", await db.from("timesheets").insert({
          clinic_id: employment.data?.clinic_id,
          employment_id: employmentId,
          pay_period_id: periodId,
          status: "SUBMITTED",
          submitted_at: new Date().toISOString(),
          submitted_by: uid,
        }));
        return;
      }

      ok("submit", await db.from("timesheets").update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
        submitted_by: uid,
      }).eq("id", existing.data.id as string));
    },
  };
}

export function payrollBackend(session: Session): PayrollBackend {
  return IS_PREVIEW ? previewBackend() : supabaseBackend(session);
}

/* ---- pure helpers the screen uses ------------------------------------------ */

export function hours(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toString();
}

export function money(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

/** Weeks whose start falls inside a period. */
export function weeksInPeriod(weeks: WorkWeek[], period: PayPeriod | null): WorkWeek[] {
  if (!period) return [];
  return weeks
    .filter((w) => w.workWeekStart >= period.startsOn && w.workWeekStart <= period.endsOn)
    .sort((a, b) => a.workWeekStart.localeCompare(b.workWeekStart));
}

export function entriesInPeriod(entries: TimeEntryRow[], period: PayPeriod | null): TimeEntryRow[] {
  if (!period) return [];
  return entries
    .filter((e) => e.workDate >= period.startsOn && e.workDate <= period.endsOn)
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
}

export interface PeriodTotals {
  workedHours: number;
  regularHours: number;
  overtimeHours: number;
  nonWorkedHours: number;
  anyProvisional: boolean;
}

/**
 * Period totals are the SUM of the per-week splits, never a recomputation over
 * the period's own hours. Overtime is a fact about a work week: summing 60 and
 * 20 into 80 and asking whether that exceeds 44 gives no overtime at all, where
 * the truth is 16 hours of it.
 */
export function totalsFor(weeks: WorkWeek[]): PeriodTotals {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    workedHours: round2(weeks.reduce((s, w) => s + w.workedHours, 0)),
    regularHours: round2(weeks.reduce((s, w) => s + w.regularHours, 0)),
    overtimeHours: round2(weeks.reduce((s, w) => s + w.overtimeHours, 0)),
    nonWorkedHours: round2(weeks.reduce((s, w) => s + w.nonWorkedHours, 0)),
    anyProvisional: weeks.some((w) => w.termsProvisional),
  };
}
