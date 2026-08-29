/**
 * Conflict-resolution suggestions - the rule-based version agreed on for
 * this pass, not a general solver. Two candidate kinds:
 *
 *   (a) same clinician, a different time somewhere in the same week - used
 *       by both quick-create and drag-to-reschedule, since neither ever
 *       reassigns who the session belongs to.
 *   (b) same day and time, a different clinician at the SAME location -
 *       quick-create only (drag never reassigns the clinician, by design -
 *       see CalendarView's applyReschedule). The client's day is never
 *       moved to accommodate a clinician swap: this only ever proposes the
 *       exact same date/hour/minute with a different, available,
 *       same-location clinician - "never offer Wed with Billy as a
 *       substitute for Mon with Sarah."
 *
 * "Credit toward another session" (a billing/count adjustment, not a
 * scheduling operation) has no data model behind it yet and is out of
 * scope here - see docs/context/product.md's calendar v2 backlog, item 18.
 */
import { WEEKDAY_ABBR, addDays, startOfWeek, toDateStr, parseDateStr } from "./dateUtils";

export interface AvailabilityRow {
  staff_id: number;
  day: string;
  start_time: string;
  end_time: string;
}

export interface ExistingSession {
  id: number;
  employee_id: number;
  session_date: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  status: string;
}

export interface SuggestionEmployee {
  id: number;
  name: string;
  location_id: number | null;
}

export interface Suggestion {
  dateStr: string;
  hour: number;
  minute: number;
  employeeId: number;
  employeeName: string;
  kind: "same-clinician" | "different-clinician";
  label: string;
}

export function timeToMinutes(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Generic over any {staff_id, day, start_time, end_time} row set - also
 *  used for client_availability rows by passing the client's id in place of
 *  staff_id (same shape, different owning column upstream). */
export function isAvailable(staffId: number, day: string, startMin: number, endMin: number, availability: AvailabilityRow[]): boolean {
  return availability.some((a) => a.staff_id === staffId && a.day === day &&
    timeToMinutes(a.start_time) <= startMin && timeToMinutes(a.end_time) >= endMin);
}

export function hasSessionConflict(employeeId: number, dateStr: string, startMin: number, durationMinutes: number, sessions: ExistingSession[], excludeSessionId?: number): boolean {
  const endMin = startMin + durationMinutes;
  return sessions.some((s) => {
    if (s.status === "cancelled" || s.employee_id !== employeeId || s.session_date !== dateStr) return false;
    if (excludeSessionId != null && s.id === excludeSessionId) return false;
    const sStart = s.hour * 60 + s.minute;
    return startMin < sStart + s.durationMinutes && sStart < endMin;
  });
}

function fmt(dateStr: string, hour: number, minute: number): string {
  const d = parseDateStr(dateStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = ((hour + 11) % 12) + 1;
  return `${WEEKDAY_ABBR[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} · ${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export function suggestSameClinicianOtherTime(opts: {
  employeeId: number;
  employeeName: string;
  dateStr: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  excludeSessionId?: number;
  sessions: ExistingSession[];
  staffAvailability: AvailabilityRow[];
  workStartHour: number;
  workEndHour: number;
  incrementMinutes: number;
  maxResults?: number;
}): Suggestion[] {
  const max = opts.maxResults ?? 3;
  const results: Suggestion[] = [];
  const weekStart = startOfWeek(parseDateStr(opts.dateStr));
  for (let d = 0; d < 7 && results.length < max; d++) {
    const day = addDays(weekStart, d);
    const dateStr = toDateStr(day);
    const dayAbbr = WEEKDAY_ABBR[day.getDay()];
    for (let m = opts.workStartHour * 60; m + opts.durationMinutes <= opts.workEndHour * 60 && results.length < max; m += opts.incrementMinutes) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      if (dateStr === opts.dateStr && hour === opts.hour && minute === opts.minute) continue;
      if (!isAvailable(opts.employeeId, dayAbbr, m, m + opts.durationMinutes, opts.staffAvailability)) continue;
      if (hasSessionConflict(opts.employeeId, dateStr, m, opts.durationMinutes, opts.sessions, opts.excludeSessionId)) continue;
      results.push({
        dateStr, hour, minute, employeeId: opts.employeeId, employeeName: opts.employeeName,
        kind: "same-clinician", label: fmt(dateStr, hour, minute),
      });
    }
  }
  return results;
}

export function suggestDifferentClinicianSameSlot(opts: {
  dateStr: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  locationId: number | null;
  excludeEmployeeId: number;
  employees: SuggestionEmployee[];
  sessions: ExistingSession[];
  staffAvailability: AvailabilityRow[];
  maxResults?: number;
}): Suggestion[] {
  const max = opts.maxResults ?? 3;
  const day = parseDateStr(opts.dateStr);
  const dayAbbr = WEEKDAY_ABBR[day.getDay()];
  const startMin = opts.hour * 60 + opts.minute;
  const results: Suggestion[] = [];
  for (const emp of opts.employees) {
    if (results.length >= max) break;
    if (emp.id === opts.excludeEmployeeId) continue;
    if (opts.locationId != null && emp.location_id !== opts.locationId) continue; // never cross locations
    if (!isAvailable(emp.id, dayAbbr, startMin, startMin + opts.durationMinutes, opts.staffAvailability)) continue;
    if (hasSessionConflict(emp.id, opts.dateStr, startMin, opts.durationMinutes, opts.sessions)) continue;
    results.push({
      dateStr: opts.dateStr, hour: opts.hour, minute: opts.minute, employeeId: emp.id, employeeName: emp.name,
      kind: "different-clinician", label: `${emp.name} — ${fmt(opts.dateStr, opts.hour, opts.minute)}`,
    });
  }
  return results;
}
