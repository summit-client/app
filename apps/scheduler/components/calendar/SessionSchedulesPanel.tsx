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
import { WEEKDAY_ABBR, addDays, toDateStr, parseDateStr, startOfWeek, formatFullRange, formatWeekMonthLabel } from "./dateUtils";
import { isAvailable, hasSessionConflict, hasClientSessionConflict, buildBusyBlocks } from "./suggestions";
import type { AvailabilityRow, ExistingSession } from "./suggestions";
import { sessionDuration } from "./types";
import type { CalSession, CalClient, CalEmployee, CalSessionType } from "./types";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useAppUser } from "../../lib/UserContext";
import { canSeeClientIdentity } from "../../lib/sessionPrivacy";

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
  /**
   * Whether the viewer may propose a new time for THIS session at all -
   * mirrors SessionDetail's `canManage` (2026-09-02, migration 0046). When
   * false, only the slot-picker and "Continue to reschedule" are omitted,
   * since picking a slot here hands off to RescheduleModal, which writes.
   *
   * This is NOT the privacy gate, and used to be described as though the
   * comparison "still renders in full" for a clinician viewing a
   * colleague's session. It no longer does: SessionDetail won't open this
   * panel at all for a session whose client the viewer may not see, and the
   * two places below that would otherwise name the client fall back to
   * "Client" on their own (lib/sessionPrivacy.ts). Nothing here depends on
   * the caller remembering that.
   */
  canPropose?: boolean;
}

type SlotState = "open" | "clinician-only" | "client-only" | "neither" | "booked";

// "Clinician only" and "client only" used to be the exact same colour
// (#EF9F2722/#8A5E10, orange) - indistinguishable at this panel's tight
// size, and orange is also this app's "draft calendar" warning colour
// elsewhere (CalendarView's "Show drafts" toggle/banner), so reusing it
// here for two DIFFERENT things was doubly confusing (issue #133: "I see
// green and orange... I need to know what the orange represents... I have
// no idea, I'm just guessing"). Blue vs. rose are both far enough from the
// existing green (open)/red (booked)/neutral-grey (neither) pair, and from
// each other, to read apart at a glance - see the legend rendered below,
// which already existed but couldn't rescue two identical swatches.
/** The four states the legend explains, in traffic-light order. `booked` is
 *  not among them: it now shares `neither`'s red, so listing it would be a
 *  second identical swatch. */
const LEGEND_STATES: SlotState[] = ["open", "clinician-only", "client-only", "neither"];

const slotColors: Record<SlotState, { bg: string; text: string; label: string }> = {
  // Four states, traffic-light ordered: green / blue / yellow / red. The old
  // set used three near-identical 13%-alpha tints plus a separate pink for a
  // booked conflict, which at an 8px swatch was indistinguishable. Pastel is
  // kept - these sit behind text and next to each other all across the grid -
  // but the hues are now far enough apart to read at a glance.
  //
  // `booked` deliberately shares the red of `neither`: from the point of view
  // of someone picking a slot both mean "you cannot have this one", and the
  // brief asked for four. Its own label still says which it is.
  open: { bg: "#CFEBDD", text: "#0F6E56", label: "Both available" },
  "clinician-only": { bg: "#D3E1F7", text: "#2B5BA6", label: "Clinician only" },
  "client-only": { bg: "#F7E8C3", text: "#8A6410", label: "Client only" },
  neither: { bg: "#F5D5D5", text: "#A33A3A", label: "Neither available" },
  booked: { bg: "#F5D5D5", text: "#A33A3A", label: "Already busy" },
};

export function SessionSchedulesPanel({
  session, client, employee, sessionTypes, staffAvailability, clientAvailability,
  clinicId, workStartHour, workEndHour, incrementMinutes, onClose, onProposeSlot, canPropose = true,
}: Props) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trapRef = useFocusTrap<HTMLDivElement>();
  // Re-derived here rather than trusted from the caller: the two labels
  // below are the only places in this panel that name anyone, and they
  // should fall back on their own if this ever gets a new caller.
  const viewer = useAppUser();
  const clientLabel = canSeeClientIdentity(viewer, session) ? client?.name : undefined;

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
      // `sessions_visible()` (migration 0077), not the `sessions` table -
      // and for this panel specifically that is a correctness requirement,
      // not a formality. Its whole job is finding a slot where the clinician
      // AND the child are both free, so the `client_id.eq` half has to match
      // that child's sessions with OTHER clinicians; read from the table, a
      // clinician now sees none of those and the panel would report "free"
      // for a child who is already booked. The function reveals client_id
      // for a client the caller demonstrably works with themselves, which is
      // exactly this case - see migration 0077's header.
      const { data, error: err } = await supabase
        .rpc("sessions_visible", { p_from: rangeStart, p_to: rangeEnd })
        .eq("clinic_id", clinicId)
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

  // Blocks used to render in a single 30px-tall lane, positioned purely by
  // left/width percentage with no collision handling - two sessions that
  // overlap in time (or a "Busy" block simply adjacent to the viewed
  // session once the `Math.max(2, ...)` minimum width rounds it wider than
  // its real duration) rendered directly on top of each other. That's the
  // "bouncing box around the word Busy... overlaps the clinician's own
  // session" bug from issue #133: reproduced with a same-clinician session
  // overlapping the viewed one. Fixed with a small interval-graph coloring
  // (same idea as TimeGrid's clusterByOverlap, just 1-D since there's no
  // vertical time axis here) - blocks that overlap in time get their own
  // row instead of sharing one.
  const ROW_H = 22;
  const ROW_GAP = 3;
  function layoutIntoRows(blocks: ReturnType<typeof buildBusyBlocks>): { rows: number; placed: (ReturnType<typeof buildBusyBlocks>[number] & { row: number })[] } {
    const rowEnds: number[] = [];
    const placed = blocks.map((b) => {
      let row = rowEnds.findIndex((end) => end <= b.startMinutes);
      if (row === -1) { row = rowEnds.length; rowEnds.push(b.endMinutes); }
      else rowEnds[row] = b.endMinutes;
      return { ...b, row };
    });
    return { rows: Math.max(1, rowEnds.length), placed };
  }

  // Whole hours across the work day, for the axis and the lane gridlines.
  // Without these the lanes were two unlabelled strips and nothing said they
  // were a day laid out left to right, which is the whole point of them.
  const hourTicks = React.useMemo(() => {
    const out: number[] = [];
    for (let h = workStartHour; h <= workEndHour; h++) out.push(h);
    return out;
  }, [workStartHour, workEndHour]);

  function renderAxis() {
    return (
      <div style={{ position: "relative", height: 14, marginBottom: 2 }}>
        {hourTicks.map((h) => {
          const left = pct(h * 60);
          // The first and last labels would hang off their end of the strip,
          // so they anchor to it instead of centring on the tick.
          const isFirst = h === workStartHour;
          const isLast = h === workEndHour;
          return (
            <span
              key={h}
              style={{
                position: "absolute", left: `${left}%`, top: 0, fontSize: 9,
                color: "var(--color-text-tertiary)", whiteSpace: "nowrap",
                transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {((h + 11) % 12) + 1}{h >= 12 ? "p" : "a"}
            </span>
          );
        })}
      </div>
    );
  }

  function renderLane(label: string, blocks: ReturnType<typeof buildBusyBlocks>) {
    const { rows, placed } = layoutIntoRows(blocks);
    const laneHeight = rows * ROW_H + (rows - 1) * ROW_GAP + 6;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.04em", marginBottom: 4 }}>{label.toUpperCase()}</div>
        <div style={{ position: "relative", height: laneHeight, borderRadius: 6, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
          {/* Hour gridlines, under the blocks. Same ticks as the axis above,
              so a block's left edge can be read back to a time. */}
          {hourTicks.map((h) => (
            <div key={h} aria-hidden style={{
              position: "absolute", top: 0, bottom: 0, left: `${pct(h * 60)}%`, width: 1,
              background: "var(--color-border-tertiary)", opacity: 0.5,
            }} />
          ))}
          {placed.map((b) => (
            <div
              key={b.id}
              title={b.isViewedSession ? `This session · ${fmtHM(b.startMinutes)} – ${fmtHM(b.endMinutes)}` : `Busy · ${fmtHM(b.startMinutes)} – ${fmtHM(b.endMinutes)}`}
              style={{
                position: "absolute", top: 3 + b.row * (ROW_H + ROW_GAP), height: ROW_H,
                left: `${pct(b.startMinutes)}%`, width: `${Math.max(2, pct(b.endMinutes) - pct(b.startMinutes))}%`,
                borderRadius: 4,
                background: b.isViewedSession ? "#378ADD" : "#88888855",
                border: b.isViewedSession ? "1.5px solid #2b6cb0" : "0.5px solid var(--color-border-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 600, color: b.isViewedSession ? "#fff" : "var(--color-text-secondary)", whiteSpace: "nowrap", padding: "0 3px" }}>
                {b.isViewedSession ? "This" : "Busy"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    // stopPropagation: this overlay renders INSIDE SessionDetail's own
    // overlay, whose onClick is also onClose - without it, tapping the
    // backdrop around this dialog closed both at once, which on a phone is
    // most of the screen.
    <div style={overlayStyle} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Both schedules" className="modal-sheet" style={{ ...modalStyle, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>Both schedules</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
          {employee?.name || "Clinician"} &amp; {clientLabel || "Client"}
        </div>

        {/* A day strip showing just "31, 1, 2, 3" is ambiguous the moment a
            week crosses a month boundary (issue #133's own example: Aug 31
            into September) - this names the month(s) the visible week
            actually falls in, next to (not instead of) the existing
            week-navigation row. */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
          {formatWeekMonthLabel(weekDays)}
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
            {renderAxis()}
            {renderLane(employee?.name ? `${employee.name} (clinician)` : "Clinician", clinicianBlocks)}
            {renderLane(clientLabel ? `${clientLabel} (client)` : "Client", clientBlocks)}
            <div style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
              {WEEKDAY_ABBR[parseDateStr(selectedDate).getDay()]} {selectedDate}
            </div>

            {canPropose && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Pick an open slot to propose a new time:</div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 6, flexWrap: "wrap" }}>
                  {LEGEND_STATES.map((k) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: slotColors[k].bg, border: "0.5px solid var(--color-border-tertiary)" }} />
                      {slotColors[k].label}
                    </span>
                  ))}
                </div>
                {/* No maxHeight: a nested scroll region inside a modal that
                    already scrolls is close to unusable on touch (the outer
                    one swallows the gesture at either end). The modal grows
                    and scrolls as one piece instead - the same argument
                    RescheduleModal's own slot grid already makes. */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
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
                          flex: "0 1 58px", minWidth: 58, padding: "6px 4px", borderRadius: 6, fontSize: 11.5,
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
          </>
        )}

        {canPropose && proposed && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#5DCAA512", border: "0.5px solid #5DCAA544", marginBottom: 12, fontSize: 13, color: "var(--color-text-primary)" }}>
            {/* Both times, not just the new one: "New: Sat 11:30" on its own
                asks the reader to remember what it is replacing. */}
            <div style={{ color: "var(--color-text-secondary)" }}>
              Current: {formatFullRange(session.session_date, session.hour, session.minute, duration)}
            </div>
            <div style={{ fontWeight: 600 }}>
              New: {formatFullRange(selectedDate, proposed.hour, proposed.minute, duration)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {canPropose && (
            <button
              onClick={() => proposed && onProposeSlot(selectedDate, proposed.hour, proposed.minute)}
              disabled={!proposed}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: proposed ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 500, opacity: proposed ? 1 : 0.6 }}
            >
              Continue to reschedule
            </button>
          )}
          <button onClick={onClose} style={navBtnSmall}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  // flex-start + the overlay's own scroll, not alignItems:center: a centred
  // modal taller than the viewport overflows equally in BOTH directions,
  // and the half above the top edge cannot be scrolled to. iOS Safari hits
  // that routinely, since vh there resolves against the large viewport.
  // No background and no blur of its own. This panel has exactly one caller
  // (SessionDetail), which already renders it INSIDE its own scrimmed
  // overlay - so a second 35% black plus a second 2.8px blur composited on
  // top of the first, and the page visibly darkened on "View both
  // schedules" and lightened again on the way back out. That step-down,
  // step-up was the whole "pyramid" effect; one scrim, owned by the
  // outermost dialog, keeps every level at the same weight.
  position: "fixed", inset: 0, background: "transparent", zIndex: 110, display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: 16, overflowY: "auto",
};
// The height cap is .modal-sheet in styles/globals.css (max-height: 94vh
// then 94dvh, two declarations an inline style object can't express).
const modalStyle: React.CSSProperties = {
  background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
  margin: "auto 0", overflowY: "auto",
};
const navBtnSmall: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, fontSize: 12, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
