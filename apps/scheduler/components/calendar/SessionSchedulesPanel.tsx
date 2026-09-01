/**
 * Dual mini-calendar opened from a session's detail popup (SessionDetail) -
 * shows the clinician's AND the client's own schedules for the week around
 * the clicked session, side by side, so a scheduler can see what's actually
 * open for BOTH people before adjusting the booking's timing. Requested
 * against PR #74's calendar rebuild; reuses that work's own date math and
 * conflict/availability helpers (dateUtils.ts, suggestions.ts) rather than
 * reimplementing them.
 *
 * PHI, not optional (mirrors this schema's clinic_id/RLS rules in CLAUDE.md's
 * Hard Constraints - this is the same principle enforced at the UI layer
 * instead of the database): every OTHER session on either person's calendar
 * renders as an opaque "Busy" block - time and duration only, no client
 * name, no session type, no notes. Only the session actually being viewed
 * (the one the popup opened for) ever shows identity or clinical detail, on
 * BOTH lanes, since it's the one session both people already consented to
 * share a screen over. The query itself is scoped by clinic_id exactly like
 * every other read in this app (CalendarView.loadRange, RescheduleModal) -
 * no new RLS surface, no elevated role, nothing this popup's caller couldn't
 * already reach.
 *
 * Read-only plus "propose a new time": clicking an open slot sets a
 * proposed date/time and hands it back to the caller (onProposeSlot) rather
 * than writing anything itself. The actual write - with its fresh
 * conflict/gap re-checks and recurrence handling - stays RescheduleModal's
 * job (reused, not reimplemented; see CalendarView's wiring). Full
 * drag-to-reschedule from this panel was flagged as a stretch goal, not
 * shipped here.
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { WEEKDAY_ABBR, addDays, toDateStr, parseDateStr, startOfWeek, formatFullRange } from "./dateUtils";
import { isAvailable, hasSessionConflict, hasClientSessionConflict, buildBusyBlocks } from "./suggestions";
import type { AvailabilityRow, ExistingSession } from "./suggestions";
import { sessionDuration } from "./types";
import type { CalSession, CalClient, CalEmployee, CalSessionType } from "./types";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface ClientAvailabilityRow { client_id: number; day: string; start_time: string; end_time: string }

interface Props {
  session: CalSession;
  client: CalClient | undefined;
  employee: CalEmployee | undefined;
  sessionTypes: CalSessionType[];
  staffAvailability: AvailabilityRow[];
  clientAvailability: ClientAvailabilityRow[];
  clinicId: string;
  workStartHour: number;
  workEndHour: number;
  incrementMinutes: number;
  onClose: () => void;
  /** Hands a picked slot back to the caller (CalendarView / SessionsView),
   *  which is expected to open RescheduleModal pre-filled with it. This
   *  panel never writes to `sessions` itself. */
  onProposeSlot: (dateStr: string, hour: number, minute: number) => void;
}

type SlotState = "open" | "clinician-only" | "client-only" | "neither" | "booked";

const slotColors: Record<SlotState, { bg: string; text: string; label: string }> = {
  open: { bg: "#5DCAA522", text: "#0F6E56", label: "Both open" },
  "clinician-only": { bg: "#EF9F2722", text: "#8A5E10", label: "Clinician only" },
  "client-only": { bg: "#EF9F2722", text: "#8A5E10", label: "Client only" },
  neither: { bg: "var(--color-background-secondary)", text: "var(--color-text-tertiary)", label: "Neither marked available" },
  booked: { bg: "#FCE8E8", text: "#A33A3A", label: "Conflict — already busy" },
};

export function SessionSchedulesPanel({
  session, client, employee, sessionTypes, staffAvailability, clientAvailability,
  clinicId, workStartHour, workEndHour, incrementMinutes, onClose, onProposeSlot,
}: Props) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const duration = sessionDuration(session, sessionTypes);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(parseDateStr(session.session_date)));
  const [selectedDate, setSelectedDate] = React.useState(session.session_date);
  const [proposed, setProposed] = React.useState<{ hour: number; minute: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [clinicianSessions, setClinicianSessions] = React.useState<ExistingSession[]>([]);
  const [clientSessions, setClientSessions] = React.useState<ExistingSession[]>([]);

  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const rangeStart = toDateStr(weekDays[0]);
  const rangeEnd = toDateStr(weekDays[6]);

  // Self-contained fetch, deliberately not dependent on whatever date range
  // the calling view happens to already have loaded - Day/N-day modes only
  // ever load a narrow slice, and this needs a full week for both people
  // regardless of what's on screen. Same table, same clinic_id scoping as
  // every other read in this app (see this file's header) - re-runs
  // whenever the visible week changes so Prev/Next week here works too.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!clinicId || !employee || !client) { setLoading(false); return; }
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("sessions")
        .select("id, client_id, employee_id, session_date, hour, minute, type, status")
        .eq("clinic_id", clinicId)
        .gte("session_date", rangeStart)
        .lte("session_date", rangeEnd)
        .neq("status", "cancelled")
        .or(`employee_id.eq.${employee.id},client_id.eq.${client.id}`);
      if (cancelled) return;
      if (err || !data) {
        setError("Couldn't load either person's schedule. Try again.");
        setClinicianSessions([]);
        setClientSessions([]);
        setLoading(false);
        return;
      }
      const toExisting = (s: { id: number; client_id: number | null; employee_id: number; session_date: string; hour: number; minute: number; type: string; status: string }): ExistingSession => ({
        id: s.id,
        employee_id: s.employee_id,
        client_id: s.client_id,
        session_date: s.session_date,
        hour: s.hour,
        minute: s.minute,
        durationMinutes: sessionDuration({ ...session, type: s.type }, sessionTypes),
        status: s.status,
      });
      setClinicianSessions(data.filter((s) => s.employee_id === employee.id).map(toExisting));
      setClientSessions(data.filter((s) => s.client_id === client.id).map(toExisting));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
    // sessionTypes/session are read for duration lookup only, not identity -
    // omitted from deps since they don't change while this panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, employee?.id, client?.id, rangeStart, rangeEnd]);

  const dayAbbr = WEEKDAY_ABBR[parseDateStr(selectedDate).getDay()];
  const clinicianBlocks = React.useMemo(() => buildBusyBlocks(selectedDate, clinicianSessions, session.id), [selectedDate, clinicianSessions, session.id]);
  const clientBlocks = React.useMemo(() => buildBusyBlocks(selectedDate, clientSessions, session.id), [selectedDate, clientSessions, session.id]);

  const slots = React.useMemo(() => {
    const out: { hour: number; minute: number; state: SlotState }[] = [];
    for (let m = workStartHour * 60; m + duration <= workEndHour * 60; m += incrementMinutes) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      const clinicianBusy = employee ? hasSessionConflict(employee.id, selectedDate, m, duration, clinicianSessions, session.id) : false;
      const clientBusy = client ? hasClientSessionConflict(client.id, selectedDate, m, duration, clientSessions, session.id) : false;
      const clinicianAvail = employee ? isAvailable(employee.id, dayAbbr, m, m + duration, staffAvailability) : true;
      const clientAvail = client
        ? isAvailable(client.id, dayAbbr, m, m + duration, clientAvailability.map((r) => ({ staff_id: r.client_id, day: r.day, start_time: r.start_time, end_time: r.end_time })))
        : true;
      let state: SlotState;
      if (clinicianBusy || clientBusy) state = "booked";
      else if (!clinicianAvail && !clientAvail) state = "neither";
      else if (!clinicianAvail) state = "client-only";
      else if (!clientAvail) state = "clinician-only";
      else state = "open";
      out.push({ hour, minute, state });
    }
    return out;
  }, [selectedDate, dayAbbr, duration, clinicianSessions, clientSessions, staffAvailability, clientAvailability, employee, client, workStartHour, workEndHour, incrementMinutes, session.id]);

  const totalSpanMin = (workEndHour - workStartHour) * 60;
  function pct(minutes: number): number {
    return Math.max(0, Math.min(100, ((minutes - workStartHour * 60) / totalSpanMin) * 100));
  }
  function fmtHM(totalMin: number): string {
    const h24 = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function renderLane(label: string, blocks: ReturnType<typeof buildBusyBlocks>) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.04em", marginBottom: 4 }}>{label.toUpperCase()}</div>
        <div style={{ position: "relative", height: 30, borderRadius: 6, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
          {blocks.map((b) => (
            <div
              key={b.id}
              title={b.isViewedSession ? `This session · ${fmtHM(b.startMinutes)} – ${fmtHM(b.endMinutes)}` : `Busy · ${fmtHM(b.startMinutes)} – ${fmtHM(b.endMinutes)}`}
              style={{
                position: "absolute", top: 3, bottom: 3,
                left: `${pct(b.startMinutes)}%`, width: `${Math.max(2, pct(b.endMinutes) - pct(b.startMinutes))}%`,
                borderRadius: 4,
                background: b.isViewedSession ? "#378ADD" : "#88888855",
                border: b.isViewedSession ? "1.5px solid #2b6cb0" : "0.5px solid var(--color-border-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 600, color: b.isViewedSession ? "#fff" : "var(--color-text-secondary)", whiteSpace: "nowrap", padding: "0 3px" }}>
                {b.isViewedSession ? "This session" : "Busy"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Both schedules" style={{ ...modalStyle, width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>Both schedules</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
          {employee?.name || "Clinician"} &amp; {client?.name || "Client"} — other sessions on either calendar show only as &quot;Busy&quot;, never who they belong to.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 6px" }}>
          <button aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtnSmall}>‹</button>
          <button onClick={() => setWeekStart(startOfWeek(parseDateStr(session.session_date)))} style={navBtnSmall}>Session&apos;s week</button>
          <button aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtnSmall}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 12 }}>
          {weekDays.map((d) => {
            const dateStr = toDateStr(d);
            const isSel = dateStr === selectedDate;
            const isViewedDay = dateStr === session.session_date;
            return (
              <button
                key={dateStr}
                onClick={() => { setSelectedDate(dateStr); setProposed(null); }}
                style={{
                  padding: "6px 2px", borderRadius: 7, fontSize: 11.5, textAlign: "center", cursor: "pointer",
                  border: `1px solid ${isSel ? "#5DCAA5" : isViewedDay ? "#378ADD88" : "var(--color-border-tertiary)"}`,
                  background: isSel ? "#5DCAA51f" : "var(--color-background-primary)",
                  color: isSel ? "#3f9c78" : "var(--color-text-primary)",
                }}
              >
                <div>{WEEKDAY_ABBR[d.getDay()]}</div>
                <div style={{ fontWeight: 600 }}>{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>Loading both schedules…</div>
        ) : error ? (
          <div style={{ padding: "12px 0", fontSize: 13, color: "#A33A3A" }}>{error}</div>
        ) : (
          <>
            {renderLane(employee?.name ? `${employee.name} (clinician)` : "Clinician", clinicianBlocks)}
            {renderLane(client?.name ? `${client.name} (client)` : "Client", clientBlocks)}
            <div style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
              {workStartHour}:00 – {workEndHour}:00, {WEEKDAY_ABBR[parseDateStr(selectedDate).getDay()]} {selectedDate}
            </div>

            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Pick an open slot to propose a new time:</div>
            <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 6, flexWrap: "wrap" }}>
              {(Object.keys(slotColors) as SlotState[]).map((k) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: slotColors[k].bg, border: "0.5px solid var(--color-border-tertiary)" }} />
                  {slotColors[k].label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, maxHeight: 140, overflowY: "auto" }}>
              {slots.map((s, i) => {
                const isSel = proposed?.hour === s.hour && proposed?.minute === s.minute;
                const c = slotColors[s.state];
                const disabled = s.state === "booked";
                return (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => setProposed({ hour: s.hour, minute: s.minute })}
                    style={{
                      flex: "1 1 58px", minWidth: 58, padding: "6px 4px", borderRadius: 6, fontSize: 11.5,
                      cursor: disabled ? "not-allowed" : "pointer",
                      border: `1.5px solid ${isSel ? "#5DCAA5" : "transparent"}`,
                      background: c.bg, color: c.text, fontWeight: isSel ? 600 : 400,
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {proposed && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#5DCAA512", border: "0.5px solid #5DCAA544", marginBottom: 12, fontSize: 13, color: "var(--color-text-primary)" }}>
            Proposed: {formatFullRange(selectedDate, proposed.hour, proposed.minute, duration)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => proposed && onProposeSlot(selectedDate, proposed.hour, proposed.minute)}
            disabled={!proposed}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: proposed ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 500, opacity: proposed ? 1 : 0.6 }}
          >
            Continue to reschedule
          </button>
          <button onClick={onClose} style={navBtnSmall}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
};
const modalStyle: React.CSSProperties = {
  background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
  maxHeight: "94vh", overflowY: "auto",
};
const navBtnSmall: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, fontSize: 12, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
