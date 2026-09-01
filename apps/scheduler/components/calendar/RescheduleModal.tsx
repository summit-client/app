/**
 * Opened from a session's detail view - a mini-calendar (a 7-day strip plus
 * a time-slot list for whichever day is selected) showing the client's and
 * clinician's availability, with dropdowns to change clinician, location,
 * and session type on that one booking, plus a home-visit toggle matching
 * the quick-create step's own location model (migration 0018).
 *
 * Single-session only for who it belongs to - changing a whole recurring
 * series' clinician/type/location is a bigger decision than this pass
 * takes on (drag-to-reschedule's this/following/all prompt is deliberately
 * time-only for the same reason - see CalendarView's applyReschedule). The
 * one series-shaped thing this DOES do is let a still one-time session
 * start repeating going forward - a strictly additive change (new rows
 * only, this session's own row untouched apart from its date/time), not a
 * rewrite of an existing series' pattern, which stays out of scope.
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { WEEKDAY_ABBR, addDays, toDateStr, parseDateStr, todayDateStr, gapsOverlap, generateWeeklyDatesFrom } from "./dateUtils";
import { isAvailable, hasSessionConflict } from "./suggestions";
import type { AvailabilityRow, ExistingSession } from "./suggestions";
import { sessionDuration } from "./types";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { fetchFreshConflict, fetchFreshConflictKeys, slotKeyOf, isBookingConflictError } from "../../lib/checkSlotConflict";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface ClientAvailabilityRow { client_id: number; day: string; start_time: string; end_time: string }

interface Props {
  session: CalSession;
  client: CalClient | undefined;
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  liveSessions: CalSession[];
  staffAvailability: AvailabilityRow[];
  clientAvailability: ClientAvailabilityRow[];
  clinicId: string;
  workStartHour: number;
  workEndHour: number;
  orgIncrementMinutes: number;
  /** Pre-selects a date/time instead of the session's own current one - set
   *  when this modal is opened via "Continue to reschedule" from the
   *  dual-schedule mini-calendar (SessionSchedulesPanel) after a slot was
   *  picked there. The grid below still lets the user change it before
   *  saving - this only seeds the initial selection. */
  initialSlot?: { dateStr: string; hour: number; minute: number } | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type SlotState = "open" | "clinician-only" | "client-only" | "neither" | "booked";

export function RescheduleModal({
  session, client, employees, locations, sessionTypes, liveSessions, staffAvailability, clientAvailability,
  clinicId, workStartHour, workEndHour, orgIncrementMinutes, initialSlot, onClose, onSaved,
}: Props) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [employeeId, setEmployeeId] = React.useState(session.employee_id);
  const [locationId, setLocationId] = React.useState(session.location_id);
  const [isHome, setIsHome] = React.useState(session.is_home_visit);
  const [homeAddress, setHomeAddress] = React.useState(session.home_address || "");
  const [typeName, setTypeName] = React.useState(session.type);
  const [weekStart, setWeekStart] = React.useState(() => {
    const d = parseDateStr(initialSlot?.dateStr || session.session_date);
    const day = d.getDay();
    return addDays(d, day === 0 ? -6 : 1 - day);
  });
  const [selectedDate, setSelectedDate] = React.useState(initialSlot?.dateStr || session.session_date);
  const [selectedSlot, setSelectedSlot] = React.useState<{ hour: number; minute: number } | null>(
    initialSlot ? { hour: initialSlot.hour, minute: initialSlot.minute } : { hour: session.hour, minute: session.minute },
  );
  const [repeatWeekly, setRepeatWeekly] = React.useState(false);
  const [endType, setEndType] = React.useState<"date" | "count" | null>(null);
  const [endDate, setEndDate] = React.useState("");
  const [endCount, setEndCount] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const type = sessionTypes.find((t) => t.name === typeName);
  const duration = type?.duration_minutes ?? type?.duration ?? sessionDuration(session, sessionTypes);
  // The currently-selected session type's own increment override, matching
  // the main grid's drag-snap resolution (sessionGridIncrement) instead of
  // always stepping at the org default regardless of which type is picked.
  const incrementMinutes = type?.grid_increment_minutes ?? orgIncrementMinutes;
  const existing: ExistingSession[] = liveSessions
    .filter((s) => s.status !== "cancelled" && s.id !== session.id)
    .map((s) => ({ id: s.id, employee_id: s.employee_id, client_id: s.client_id, session_date: s.session_date, hour: s.hour, minute: s.minute, durationMinutes: sessionDuration(s, sessionTypes), status: s.status }));

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function dayHasClinicianAvailability(d: Date): boolean {
    return staffAvailability.some((a) => a.staff_id === employeeId && a.day === WEEKDAY_ABBR[d.getDay()]);
  }

  const slots = React.useMemo(() => {
    const dateStr = selectedDate;
    const d = parseDateStr(dateStr);
    const dayAbbr = WEEKDAY_ABBR[d.getDay()];
    const out: { hour: number; minute: number; state: SlotState }[] = [];
    for (let m = workStartHour * 60; m + duration <= workEndHour * 60; m += incrementMinutes) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      const conflict = hasSessionConflict(employeeId, dateStr, m, duration, existing);
      const clinicianOk = isAvailable(employeeId, dayAbbr, m, m + duration, staffAvailability);
      const clientOk = client ? isAvailable(client.id, dayAbbr, m, m + duration, clientAvailability.map((r) => ({ staff_id: r.client_id, day: r.day, start_time: r.start_time, end_time: r.end_time }))) : true;
      let state: SlotState = "open";
      if (conflict) state = "booked";
      else if (!clinicianOk && !clientOk) state = "neither";
      else if (!clinicianOk) state = "client-only";
      else if (!clientOk) state = "clinician-only";
      out.push({ hour, minute, state });
    }
    return out;
  }, [selectedDate, employeeId, duration, existing, staffAvailability, clientAvailability, client, workStartHour, workEndHour, incrementMinutes]);

  // Same colour-legibility fix as SessionSchedulesPanel.tsx's identical
  // legend (issue #133 item 2) - "clinician-only"/"client-only" used to
  // share one colour here too, and this modal is reached directly from
  // that panel's "Continue to reschedule" button, so the two need to agree
  // visually as well as textually.
  const slotColors: Record<SlotState, { bg: string; text: string; label: string }> = {
    open: { bg: "#5DCAA522", text: "#0F6E56", label: "Both available" },
    "clinician-only": { bg: "#5B8DEF22", text: "#2B5BA6", label: "Clinician only" },
    "client-only": { bg: "#D4537E22", text: "#9C3459", label: "Client only" },
    neither: { bg: "var(--color-background-secondary)", text: "var(--color-text-tertiary)", label: "Neither marked available" },
    booked: { bg: "#FCE8E8", text: "#A33A3A", label: "Clinician busy" },
  };

  function findGapHit(dateStr: string, hour: number, minute: number): boolean {
    const gapBefore = type?.gap_before_minutes ?? 0;
    const gapAfter = type?.gap_after_minutes ?? 0;
    if (!gapBefore && !gapAfter) return false;
    const candStart = hour * 60 + minute;
    return existing.some((b) => gapsOverlap(
      { sessionDate: dateStr, employeeId, clientId: session.client_id, startMinutes: candStart, durationMinutes: duration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
      { sessionDate: b.session_date, employeeId: b.employee_id, clientId: b.client_id ?? null, startMinutes: b.hour * 60 + b.minute, durationMinutes: b.durationMinutes, gapBeforeMinutes: 0, gapAfterMinutes: 0 },
    ));
  }

  async function handleSave() {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);

    if (findGapHit(selectedDate, selectedSlot.hour, selectedSlot.minute) && !confirm("This lands inside a buffer window around another session (same clinician or client). Save anyway?")) {
      setSaving(false);
      return;
    }

    // Re-check against the database right before writing - `existing`
    // (liveSessions) is a prop that can be stale for as long as this modal
    // has been open. See lib/checkSlotConflict.ts.
    const fresh = await fetchFreshConflict(
      { employeeId, dateStr: selectedDate, hour: selectedSlot.hour, minute: selectedSlot.minute },
      session.id,
    );
    if (fresh) {
      setSaving(false);
      setError("That slot was just booked by someone else - pick another time.");
      return;
    }

    // Only actually assign a new recurrence_id when the future occurrences
    // are really about to be created below - otherwise a checked "repeat
    // weekly" box with no end condition chosen yet would leave this session
    // permanently flagged as part of a series that has exactly one row in
    // it, which would wrongly trigger drag-to-reschedule's this/following/
    // all prompt later for a series that was never actually created.
    const canRepeat = !session.recurrence_id;
    const willRepeat = canRepeat && repeatWeekly && !!endType && !!(endType === "date" ? endDate : endCount);
    const recurrenceId = willRepeat ? crypto.randomUUID() : session.recurrence_id;

    const { error: err } = await supabase.from("sessions").update({
      session_date: selectedDate,
      hour: selectedSlot.hour,
      minute: selectedSlot.minute,
      employee_id: employeeId,
      location_id: isHome ? null : locationId,
      is_home_visit: isHome,
      home_address: isHome ? (homeAddress || null) : null,
      type: typeName,
      recurrence_id: recurrenceId,
    }).eq("id", session.id);

    if (err) {
      // Same reasoning as the fresh pre-check above - migration 0041's DB
      // constraint is the backstop for a write that races another one
      // within this same round trip. See lib/checkSlotConflict.ts.
      setError(isBookingConflictError(err)
        ? "That slot was just booked by someone else - pick another time."
        : "Save failed. Try again.");
      setSaving(false);
      return;
    }

    if (willRepeat) {
      // Additive only: new rows for the future occurrences, starting the
      // week after the date just saved above - this session's own row is
      // never touched again here.
      const futureDates = generateWeeklyDatesFrom(selectedDate, endType, endDate, endCount).slice(1);
      const staleFree = futureDates.filter((d) => !existing.some((b) => b.employee_id === employeeId && b.session_date === d && b.hour === selectedSlot.hour && b.minute === selectedSlot.minute));
      // Re-check the batch fresh, same reasoning as the single-slot check
      // above - `existing` can be stale for the whole time this modal has
      // been open.
      const freshKeys = await fetchFreshConflictKeys(
        staleFree.map((d) => ({ employeeId, dateStr: d, hour: selectedSlot.hour, minute: selectedSlot.minute })),
      );
      const conflictFree = staleFree.filter((d) => !freshKeys.has(slotKeyOf({ employeeId, dateStr: d, hour: selectedSlot.hour, minute: selectedSlot.minute })));
      const skipped = futureDates.length - conflictFree.length;
      const inserts = conflictFree.map((d) => ({
        recurrence_id: recurrenceId,
        client_id: session.client_id,
        employee_id: employeeId,
        hour: selectedSlot.hour,
        minute: selectedSlot.minute,
        session_date: d,
        type: typeName,
        calendar_id: session.calendar_id,
        status: "scheduled",
        clinic_id: clinicId,
        location_id: isHome ? null : locationId,
        is_home_visit: isHome,
        home_address: isHome ? (homeAddress || null) : null,
      }));
      if (inserts.length) await supabase.from("sessions").insert(inserts);
      setSaving(false);
      onSaved(skipped > 0 ? `Session updated · ${inserts.length} future session${inserts.length !== 1 ? "s" : ""} added, ${skipped} skipped (conflicts)` : `Session updated · ${inserts.length} future session${inserts.length !== 1 ? "s" : ""} added`);
      return;
    }

    setSaving(false);
    onSaved("Session updated");
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Reschedule session" style={{ ...modalStyle, width: "min(480px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>Reschedule</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: initialSlot ? 4 : 12 }}>{client?.name || "Unknown client"}</div>
        {initialSlot && (
          <div style={{ fontSize: 12, color: "#3f9c78", marginBottom: 8 }}>
            Pre-filled from the schedule comparison you just looked at — review and confirm below.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 8 }}>
          <Field label="Clinician">
            <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))} style={selectStyle}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Session type">
            <select value={typeName} onChange={(e) => setTypeName(e.target.value)} style={selectStyle}>
              {sessionTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Location">
          <div style={{ display: "flex", gap: 6, marginBottom: isHome ? 6 : 0 }}>
            <button type="button" onClick={() => setIsHome(false)} style={{ ...navBtnSmall, flex: 1, borderColor: !isHome ? "#5DCAA5" : undefined }}>Clinic</button>
            <button type="button" onClick={() => { setIsHome(true); if (!homeAddress) setHomeAddress(client?.address || ""); }} style={{ ...navBtnSmall, flex: 1, borderColor: isHome ? "#5DCAA5" : undefined }}>Client's home</button>
          </div>
          {isHome ? (
            <input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Address" style={selectStyle} />
          ) : (
            <select value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </Field>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 6px" }}>
          <button aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtnSmall}>‹</button>
          <button onClick={() => { const t = parseDateStr(todayDateStr()); const day = t.getDay(); setWeekStart(addDays(t, day === 0 ? -6 : 1 - day)); }} style={navBtnSmall}>This week</button>
          <button aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtnSmall}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {weekDays.map((d) => {
            const dateStr = toDateStr(d);
            const isSel = dateStr === selectedDate;
            const avail = dayHasClinicianAvailability(d);
            return (
              <button
                key={dateStr}
                onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                style={{
                  padding: "6px 2px", borderRadius: 7, fontSize: 11.5, textAlign: "center", cursor: "pointer",
                  border: `1px solid ${isSel ? "#5DCAA5" : "var(--color-border-tertiary)"}`,
                  background: isSel ? "#5DCAA51f" : avail ? "var(--color-background-primary)" : "var(--color-background-secondary)",
                  color: isSel ? "#3f9c78" : "var(--color-text-primary)", opacity: avail ? 1 : 0.6,
                }}
              >
                <div>{WEEKDAY_ABBR[d.getDay()]}</div>
                <div style={{ fontWeight: 600 }}>{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 6, flexWrap: "wrap" }}>
          {(Object.keys(slotColors) as SlotState[]).map((k) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: slotColors[k].bg, border: "0.5px solid var(--color-border-tertiary)" }} />
              {slotColors[k].label}
            </span>
          ))}
        </div>
        {/* Wraps instead of a fixed-height grid with its own scrollbar - a
            reschedule popup that needs a scroll just to see its own time
            slots defeats the point of it being a compact popup. This grows
            the modal's own height instead (bounded by modalStyle's
            maxHeight/overflowY safety net below) rather than hiding slots
            behind a second, nested scroll region. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {slots.map((s, i) => {
            const isSel = selectedSlot?.hour === s.hour && selectedSlot?.minute === s.minute;
            const c = slotColors[s.state];
            return (
              <button
                key={i}
                onClick={() => setSelectedSlot({ hour: s.hour, minute: s.minute })}
                style={{
                  flex: "1 1 58px", minWidth: 58, padding: "6px 4px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                  border: `1.5px solid ${isSel ? "#5DCAA5" : "transparent"}`,
                  background: c.bg, color: c.text, fontWeight: isSel ? 600 : 400,
                }}
              >
                {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
              </button>
            );
          })}
        </div>

        {!session.recurrence_id && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--color-background-secondary)", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text-primary)", cursor: "pointer", marginBottom: repeatWeekly ? 8 : 0 }}>
              <input type="checkbox" checked={repeatWeekly} onChange={(e) => { setRepeatWeekly(e.target.checked); if (!e.target.checked) setEndType(null); }} style={{ accentColor: "#5DCAA5" }} />
              Make this repeat weekly going forward
            </label>
            {repeatWeekly && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setEndType("date")} style={{ ...navBtnSmall, borderColor: endType === "date" ? "#5DCAA5" : undefined }}>By date</button>
                  <button type="button" onClick={() => setEndType("count")} style={{ ...navBtnSmall, borderColor: endType === "count" ? "#5DCAA5" : undefined }}>By count</button>
                </div>
                {endType === "date" && <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={selectStyle} />}
                {endType === "count" && <input type="number" min={1} value={endCount} onChange={(e) => setEndCount(e.target.value)} placeholder="e.g. 12" style={selectStyle} />}
              </>
            )}
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: "#A32D2D", marginBottom: 10 }}>{error}</div>}
        {(() => {
          // A checked "repeat weekly" with no end condition chosen yet is
          // an incomplete state, not a valid "just this session" save - see
          // the comment in handleSave on why that distinction matters.
          const repeatIncomplete = repeatWeekly && !(endType && (endType === "date" ? endDate : endCount));
          const disabled = saving || !selectedSlot || repeatIncomplete;
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={disabled} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500, opacity: disabled ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={onClose} style={navBtnSmall}>Cancel</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center",
  // A light blur (not the calendar's other modals - just this one, on
  // request) on whatever's behind the popup, to pull focus onto the
  // reschedule flow itself rather than the grid still visible around it.
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
};
const modalStyle: React.CSSProperties = {
  background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
  // Safety net, not the design target: the layout above (single selected
  // day's slots, wrapping instead of a nested scroll grid, trimmed spacing)
  // is meant to fit typical working-hours/increment settings on one screen
  // with nothing to scroll. This only engages for a genuinely extreme
  // combination (very long hours, very fine increment) or a very short
  // viewport, so the whole popup scrolls as one piece instead of clipping
  // silently off the bottom of the screen.
  maxHeight: "94vh", overflowY: "auto",
};
const navBtnSmall: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, fontSize: 12, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 12.5,
};
