/**
 * Opened from a session's detail view - a mini-calendar (a 7-day strip plus
 * a time-slot list for whichever day is selected) showing the client's and
 * clinician's availability, with dropdowns to change clinician, location,
 * and session type on that one booking. Single-session only, not
 * recurring-series-aware: changing who a whole series belongs to is a
 * bigger decision than this pass takes on (drag-to-reschedule's
 * this/following/all prompt is deliberately time-only for the same
 * reason - see CalendarView's applyReschedule).
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { WEEKDAY_ABBR, addDays, toDateStr, parseDateStr, todayDateStr, gapsOverlap } from "./dateUtils";
import { isAvailable, hasSessionConflict } from "./suggestions";
import type { AvailabilityRow, ExistingSession } from "./suggestions";
import { sessionDuration } from "./types";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";

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
  workStartHour: number;
  workEndHour: number;
  incrementMinutes: number;
  onClose: () => void;
  onSaved: () => void;
}

type SlotState = "open" | "clinician-only" | "client-only" | "neither" | "booked";

export function RescheduleModal({
  session, client, employees, locations, sessionTypes, liveSessions, staffAvailability, clientAvailability,
  workStartHour, workEndHour, incrementMinutes, onClose, onSaved,
}: Props) {
  const [employeeId, setEmployeeId] = React.useState(session.employee_id);
  const [locationId, setLocationId] = React.useState(session.location_id);
  const [typeName, setTypeName] = React.useState(session.type);
  const [weekStart, setWeekStart] = React.useState(() => {
    const d = parseDateStr(session.session_date);
    const day = d.getDay();
    return addDays(d, day === 0 ? -6 : 1 - day);
  });
  const [selectedDate, setSelectedDate] = React.useState(session.session_date);
  const [selectedSlot, setSelectedSlot] = React.useState<{ hour: number; minute: number } | null>({ hour: session.hour, minute: session.minute });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const type = sessionTypes.find((t) => t.name === typeName);
  const duration = type?.duration_minutes ?? type?.duration ?? sessionDuration(session, sessionTypes);
  const existing: ExistingSession[] = liveSessions
    .filter((s) => s.status !== "cancelled" && s.id !== session.id)
    .map((s) => ({ id: s.id, employee_id: s.employee_id, session_date: s.session_date, hour: s.hour, minute: s.minute, durationMinutes: sessionDuration(s, sessionTypes), status: s.status }));

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

  const slotColors: Record<SlotState, { bg: string; text: string; label: string }> = {
    open: { bg: "#5DCAA522", text: "#0F6E56", label: "Both available" },
    "clinician-only": { bg: "#EF9F2722", text: "#8A5E10", label: "Clinician only" },
    "client-only": { bg: "#EF9F2722", text: "#8A5E10", label: "Client only" },
    neither: { bg: "var(--color-background-secondary)", text: "var(--color-text-tertiary)", label: "Neither marked available" },
    booked: { bg: "#FCE8E8", text: "#A33A3A", label: "Clinician busy" },
  };

  async function handleSave() {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    const gapBefore = type?.gap_before_minutes ?? 0;
    const gapAfter = type?.gap_after_minutes ?? 0;
    if (gapBefore || gapAfter) {
      // Same-clinician only here (ExistingSession doesn't carry client_id) -
      // the same-client case is already covered by the quick-slot and drag
      // gap checks; this mini-calendar's own client-side gap check would
      // need liveSessions' full CalSession shape threaded through, which
      // isn't worth it just for this modal's warning.
      const candStart = selectedSlot.hour * 60 + selectedSlot.minute;
      const gapHit = existing.find((b) => gapsOverlap(
        { sessionDate: selectedDate, employeeId, clientId: null, startMinutes: candStart, durationMinutes: duration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
        { sessionDate: b.session_date, employeeId: b.employee_id, clientId: null, startMinutes: b.hour * 60 + b.minute, durationMinutes: b.durationMinutes, gapBeforeMinutes: 0, gapAfterMinutes: 0 },
      ));
      if (gapHit && !confirm("This lands inside a buffer window around another session. Save anyway?")) {
        setSaving(false);
        return;
      }
    }
    const { error: err } = await supabase.from("sessions").update({
      session_date: selectedDate,
      hour: selectedSlot.hour,
      minute: selectedSlot.minute,
      employee_id: employeeId,
      location_id: session.is_home_visit ? null : locationId,
      type: typeName,
    }).eq("id", session.id);
    setSaving(false);
    if (err) { setError("Save failed. Try again."); return; }
    onSaved();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>Reschedule</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{client?.name || "Unknown client"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          <Field label="Clinician">
            <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))} style={selectStyle}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select value={locationId ?? ""} disabled={session.is_home_visit} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
              {session.is_home_visit
                ? <option>Client's home</option>
                : <>
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </>}
            </select>
          </Field>
          <Field label="Session type">
            <select value={typeName} onChange={(e) => setTypeName(e.target.value)} style={selectStyle}>
              {sessionTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtnSmall}>‹</button>
          <button onClick={() => { const t = parseDateStr(todayDateStr()); const day = t.getDay(); setWeekStart(addDays(t, day === 0 ? -6 : 1 - day)); }} style={navBtnSmall}>This week</button>
          <button onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtnSmall}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 12 }}>
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

        <div style={{ display: "flex", gap: 10, fontSize: 10.5, color: "var(--color-text-tertiary)", marginBottom: 8, flexWrap: "wrap" }}>
          {(Object.keys(slotColors) as SlotState[]).map((k) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: slotColors[k].bg, border: "0.5px solid var(--color-border-tertiary)" }} />
              {slotColors[k].label}
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, maxHeight: 160, overflowY: "auto", marginBottom: 14 }}>
          {slots.map((s, i) => {
            const isSel = selectedSlot?.hour === s.hour && selectedSlot?.minute === s.minute;
            const c = slotColors[s.state];
            return (
              <button
                key={i}
                onClick={() => setSelectedSlot({ hour: s.hour, minute: s.minute })}
                style={{
                  padding: "6px 4px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                  border: `1.5px solid ${isSel ? "#5DCAA5" : "transparent"}`,
                  background: c.bg, color: c.text, fontWeight: isSel ? 600 : 400,
                }}
              >
                {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
              </button>
            );
          })}
        </div>

        {error && <div style={{ fontSize: 13, color: "#A32D2D", marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} disabled={saving || !selectedSlot} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500, opacity: saving || !selectedSlot ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} style={navBtnSmall}>Cancel</button>
        </div>
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
};
const modalStyle: React.CSSProperties = {
  background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};
const navBtnSmall: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, fontSize: 12, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 12.5,
};
