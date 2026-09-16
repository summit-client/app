/**
 * Pure time-grid math for availability editing, shared by every caller of
 * <AvailabilityGrid> (apps/scheduler's admin staff/client tabs, and the two
 * self-service "Availability" tabs on apps/employee's and apps/web's
 * profile pages). Extracted from apps/scheduler/pages/index.jsx, which had
 * its own private copy of exactly this - three call sites needing the same
 * drag-to-select grid was the actual argument for a shared package here,
 * not a subjective "reuse is nice" call.
 *
 * `incrementMinutes` used to be hardcoded to 30 in the original scheduler-only
 * version. It is now a required parameter so every caller reads it from the
 * same place - @summit/settings' `calendar.gridIncrementMinutes` - instead of
 * multiple independent copies of "30" that could drift from the org's real
 * setting and from each other.
 */

export type AvailabilityRow = { day: string; start_time: string; end_time: string };

export function generateTimeSlots(startHour: number, endHour: number, incrementMinutes: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += incrementMinutes) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

export function availToSlots(avail: AvailabilityRow[] | null | undefined, timeSlots: string[]): Set<string> {
  const sel = new Set<string>();
  (avail || []).forEach(({ day, start_time, end_time }) => {
    const s = String(start_time).substring(0, 5);
    const e = String(end_time).substring(0, 5);
    timeSlots.forEach((t) => { if (t >= s && t < e) sel.add(`${day}-${t}`); });
  });
  return sel;
}

export type AvailabilityEntityType = "staff" | "client";

export function slotsToRanges(
  selected: Set<string>,
  entityId: number,
  entityType: AvailabilityEntityType,
  availDays: string[],
  timeSlots: string[],
  endOfDayTime: string,
): Array<{ staff_id?: number; client_id?: number; day: string; start_time: string; end_time: string }> {
  const result: Array<{ staff_id?: number; client_id?: number; day: string; start_time: string; end_time: string }> = [];
  availDays.forEach((day) => {
    const daySlots = timeSlots.filter((t) => selected.has(`${day}-${t}`));
    if (!daySlots.length) return;
    let start = daySlots[0], prev = daySlots[0];
    for (let i = 1; i <= daySlots.length; i++) {
      const curr = daySlots[i];
      const pi = timeSlots.indexOf(prev), ci = curr ? timeSlots.indexOf(curr) : -1;
      if (ci === pi + 1) {
        prev = curr;
      } else {
        const ei = timeSlots.indexOf(prev) + 1;
        const end_time = ei < timeSlots.length ? timeSlots[ei] : endOfDayTime;
        result.push(entityType === "staff"
          ? { staff_id: entityId, day, start_time: start, end_time }
          : { client_id: entityId, day, start_time: start, end_time });
        if (curr) { start = curr; prev = curr; }
      }
    }
  });
  return result;
}
