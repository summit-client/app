import { supabase } from "./supabase";

/**
 * Booking-integrity audit finding: every create/move path here (quick-book,
 * batch-book, drag-to-reschedule, the reschedule mini-calendar) checks for a
 * conflicting slot against React state (`bookings`/`liveSessions`) that was
 * fetched once and can be stale for as long as the calendar/wizard has been
 * open, then writes with no re-check at all - a classic read-then-write
 * race. Two concurrent requests (two schedulers, or one scheduler with two
 * tabs) can both pass the same stale check and double-book a clinician.
 *
 * Closing this race outright needs a database constraint (a partial unique
 * index or exclusion constraint on sessions, the same shape as migration
 * 0016's cross-clinic trigger) - logged in BLOCKED-scheduler.md since this
 * session can't write migrations or touch Supabase. What's fixable from
 * here: re-check against the database immediately before every write
 * instead of trusting whatever was last fetched, which shrinks the race
 * window from "since the page loaded" to "since this one request" without
 * needing a schema change. Still not airtight - two writes issued within the
 * same round trip can still both pass - but it closes the overwhelmingly
 * more likely case of a check against minutes-old state.
 */

export interface SlotKey {
  employeeId: number;
  dateStr: string;
  hour: number;
  minute: number;
}

/** A fresh, single-slot conflict check. `excludeSessionId` lets a reschedule
 *  ignore the session's own prior row.
 *
 *  Reads `sessions_visible()` (migration 0077) rather than the `sessions`
 *  table, and here that is load-bearing: after 0077 a clinician's direct read
 *  of the table returns their own rows only, so a check against a COLLEAGUE's
 *  slot would find nothing and report "free" for a slot that is taken. The
 *  function still publishes occupancy for every row in the clinic - time,
 *  employee, type - which is precisely and only what a conflict check needs.
 *
 *  Returns just the id. It used to hand back `client_id` and `type` as well;
 *  no caller has ever read either (all three sites test it for truthiness and
 *  show a fixed "that slot was just booked" message), and client_id is the
 *  one field on this row that 0077 may have masked. Returning a field whose
 *  meaning depends on who asked, for nobody, is how the wrong name ends up on
 *  a screen later. */
export async function fetchFreshConflict(
  { employeeId, dateStr, hour, minute }: SlotKey,
  excludeSessionId?: number,
): Promise<{ id: number } | null> {
  let q = supabase
    .rpc("sessions_visible", { p_from: dateStr, p_to: dateStr })
    .select("id")
    .eq("employee_id", employeeId)
    .eq("session_date", dateStr)
    .eq("hour", hour)
    .eq("minute", minute)
    .neq("status", "cancelled");
  if (excludeSessionId != null) q = q.neq("id", excludeSessionId);
  const { data, error } = await q;
  if (error) {
    // Fail open on the check itself (network blip, etc.) - the insert/update
    // call right after this still has its own error handling, so a failed
    // pre-check degrades to "no worse than before this fix" rather than
    // blocking a legitimate booking on a transient read error.
    console.error("[checkSlotConflict] fresh conflict check failed", error);
    return null;
  }
  // Cast on the way out, matching how every other rpc() result in this repo
  // is handled (apps/data/lib/workforce.ts): with no generated Database
  // types, supabase-js cannot tell a set-returning function from a scalar one
  // and types the result as either.
  const rows = (data ?? []) as { id: number }[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Batch version for the recurring/multi-date booking paths: one query per
 * distinct employee covering every candidate date, rather than one round
 * trip per date. Returns a Set of "employeeId|dateStr|hour|minute" keys for
 * every currently-live (non-cancelled) session among the candidates, so
 * callers can re-filter an already-built insert list against it.
 */
export async function fetchFreshConflictKeys(candidates: SlotKey[]): Promise<Set<string>> {
  const byEmployee = new Map<number, Set<string>>();
  candidates.forEach(({ employeeId, dateStr }) => {
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, new Set());
    byEmployee.get(employeeId).add(dateStr);
  });

  const keys = new Set<string>();
  await Promise.all(
    [...byEmployee.entries()].map(async ([employeeId, dates]) => {
      // Same reasoning as fetchFreshConflict above: `sessions_visible()`, so
      // that a clinician checking a colleague's dates sees their occupancy
      // instead of an empty result that reads as "all free". Every column
      // selected here is occupancy, none of it is ever masked.
      const dateList = [...dates].sort();
      const { data, error } = await supabase
        .rpc("sessions_visible", { p_from: dateList[0], p_to: dateList[dateList.length - 1] })
        .select("employee_id, session_date, hour, minute")
        .eq("employee_id", employeeId)
        .in("session_date", dateList)
        .neq("status", "cancelled");
      if (error) {
        console.error("[checkSlotConflict] fresh batch conflict check failed", error);
        return;
      }
      const rows = (data ?? []) as { employee_id: number; session_date: string; hour: number; minute: number }[];
      rows.forEach((r) => {
        keys.add(`${r.employee_id}|${r.session_date}|${r.hour}|${r.minute}`);
      });
    }),
  );
  return keys;
}

export function slotKeyOf(s: SlotKey): string {
  return `${s.employeeId}|${s.dateStr}|${s.hour}|${s.minute}`;
}

/**
 * True when a write to `sessions` failed because of the migration 0045
 * booking-integrity constraint - the `sessions_no_exact_double_book` partial
 * unique index, or the `enforce_sessions_no_overlap` trigger - rather than
 * some other failure. The two layers are deliberately made to surface as one
 * of these two Postgres error codes so this check can treat them as the same
 * case: 23505 (unique_violation) from the index, and 23P01
 * (exclusion_violation) from the trigger's own `using errcode =
 * 'exclusion_violation'` (chosen specifically over the default P0001 so this
 * function doesn't have to match on the exception message text).
 *
 * This is the same race `fetchFreshConflict`/`fetchFreshConflictKeys` above
 * already try to catch pre-write - this just catches it if it still slips
 * through (two writes landing within the same round trip), so every call
 * site should show the same friendly conflict message either way rather than
 * a raw Postgres error reaching the UI. See
 * supabase/migrations/0045_sessions_no_double_booking.sql - applied live.
 */
export function isBookingConflictError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505" || error?.code === "23P01";
}
