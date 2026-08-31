/**
 * The real, dated calendar tab - replaces the old CalendarView in
 * pages/index.jsx, which rendered a fixed Mon-Sat/8am-6pm grid keyed by
 * weekday name only (no date arithmetic anywhere) filtered to one
 * "calendar" scheduling-term pill at a time.
 *
 * This owns its own date range, filters, and fetch - server-side and
 * date-range-scoped (`sessions_clinic_date_idx`, migration 0018) rather
 * than the old unfiltered `select("*")` that loaded every session ever
 * booked. Working hours come from @summit/settings (org-level,
 * calendar.workStart/workEnd/workDays) instead of the tab's own
 * never-persisted useState.
 *
 * Click-to-create hands off to the real Create wizard's "quickSlot" step
 * (pages/index.jsx) via onRequestCreate, rather than a separate bolt-on
 * form - see that step for why (recurrence + calendar-term rules need to
 * live in one place, not be reimplemented here).
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { useAppUser } from "../../lib/UserContext";
import { getSetting, onSettingsChange } from "@summit/settings";
import {
  ViewMode, computeViewRange, shiftView, toDateStr, parseDateStr, addDays, parseTimeSetting, todayDateStr, gapsOverlap,
} from "./dateUtils";
import type { GapWindow } from "./dateUtils";
import { suggestSameClinicianOtherTime } from "./suggestions";
import type { AvailabilityRow, ExistingSession, Suggestion } from "./suggestions";
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { FilterPanel, CalendarPicker, CalendarFilters, emptyFilters, activeFilterCount, matchesFilters } from "./FilterPanel";
import { RecurringIcon } from "./icons";
import { RescheduleModal } from "./RescheduleModal";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { sessionGridIncrement, sessionDuration } from "./types";
import { fetchFreshConflict } from "../../lib/checkSlotConflict";

const SPLIT_THRESHOLD = 8;

/** Escape closes whichever modal is on top - every modal in this file (and
 *  RescheduleModal, which keeps its own copy of this) already closes on an
 *  outside click; this adds the keyboard equivalent. */
function useEscapeToClose(onClose: () => void) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

interface CalCalendar { id: number; name: string; status: string; }
interface CalClientAvailability { client_id: number; day: string; start_time: string; end_time: string; }

interface Props {
  clients: CalClient[];
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  calendars: CalCalendar[];
  setCalendars: React.Dispatch<React.SetStateAction<CalCalendar[]>>;
  staffAvailability: AvailabilityRow[];
  clientAvailability: CalClientAvailability[];
  showToast: (msg?: string) => void;
  onRequestCreate: (dateStr: string, hour: number, minute: number) => void;
}

export function CalendarView({ clients, employees, locations, sessionTypes, typeColors, calendars, setCalendars, staffAvailability, clientAvailability, showToast, onRequestCreate }: Props) {
  const appUser = useAppUser();
  const clinicId = appUser?.clinic_id || "";
  const [mode, setMode] = React.useState<ViewMode>("week");
  const [weekendsInView, setWeekendsInView] = React.useState(false);
  const [nDays, setNDays] = React.useState(3);
  const [anchor, setAnchor] = React.useState<Date>(() => parseDateStr(todayDateStr()));
  const [sessions, setSessions] = React.useState<CalSession[]>([]);
  const [filters, setFilters] = React.useState<CalendarFilters>(emptyFilters());
  const [selected, setSelected] = React.useState<CalSession | null>(null);
  const [rescheduling, setRescheduling] = React.useState<CalSession | null>(null);
  const [, forceTick] = React.useState(0);

  // Measures the actual viewport-fit container so the time grid scales its
  // px-per-minute to the device instead of always rendering at one fixed
  // size and leaving a second, accidental scrollbar inside the page's own -
  // see TimeGrid's containerHeight prop. calc(100vh - ...) below approximates
  // the chrome above the grid (portal bar + this toolbar); the exact offset
  // will want a pass in a real browser across breakpoints.
  const gridAreaRef = React.useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = React.useState(480);
  React.useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setGridHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  React.useEffect(() => onSettingsChange(() => forceTick((n) => n + 1)), []);

  const workStartHour = parseTimeSetting(String(getSetting("calendar.workStart")));
  const workEndHour = parseTimeSetting(String(getSetting("calendar.workEnd")));
  const workDays = String(getSetting("calendar.workDays")).split(",").map((s) => s.trim()).filter(Boolean);
  const gridlineMinutes = Number(getSetting("calendar.gridlineMinutes")) || 60;
  const orgIncrementMinutes = Number(getSetting("calendar.gridIncrementMinutes")) || 15;
  const personalSnapMinutes = Number(getSetting("calendar.dragSnapMinutes")) || orgIncrementMinutes;

  // Drag state lives here, not in TimeGrid, so the active drag's own
  // session-type increment (a 63-minute type forcing finer snapping, say)
  // can be resolved before it's handed back down as the effective snap -
  // see sessionGridIncrement in types.ts.
  const [draggingSessionId, setDraggingSessionId] = React.useState<number | null>(null);
  const [dragHoverSlot, setDragHoverSlot] = React.useState<{ dateStr: string; hour: number; minute: number } | null>(null);
  const draggingSession = draggingSessionId != null ? sessions.find((s) => s.id === draggingSessionId) : undefined;
  const activeSnapMinutes = sessionGridIncrement(draggingSession, sessionTypes, personalSnapMinutes);

  const range = React.useMemo(
    () => computeViewRange(mode, anchor, { nDays, showWeekends: weekendsInView, workDays }),
    [mode, anchor, nDays, weekendsInView, workDays.join(",")],
  );

  const loadRange = React.useCallback(async () => {
    if (!clinicId) return;
    let q = supabase.from("sessions").select("*")
      .eq("clinic_id", clinicId)
      .gte("session_date", toDateStr(range.queryStart))
      .lte("session_date", toDateStr(range.queryEnd))
      .neq("status", "cancelled");
    if (filters.locationIds.size) q = q.in("location_id", [...filters.locationIds]);
    if (filters.typeNames.size) q = q.in("type", [...filters.typeNames]);
    if (filters.employeeIds.size) q = q.in("employee_id", [...filters.employeeIds]);
    if (filters.clientIds.size) q = q.in("client_id", [...filters.clientIds]);
    const { data } = await q;
    if (data) setSessions(data as CalSession[]);
  }, [clinicId, range.queryStart, range.queryEnd, filters]);

  React.useEffect(() => {
    const t = setTimeout(() => { void loadRange(); }, 120);
    return () => clearTimeout(t);
  }, [loadRange]);

  // Draft calendars (see the Create wizard's "calendar" step) are a working
  // area, not a live schedule - their sessions stay off this view and out
  // of conflict/gap checks until the scheduler explicitly confirms the
  // calendar (bulk status flip to "active"), same as the original ask:
  // "confirm what goes into an active version" rather than everything
  // being live the moment it's dropped onto a draft.
  const draftCalendarIds = React.useMemo(
    () => new Set(calendars.filter((c) => c.status === "draft").map((c) => c.id)),
    [calendars],
  );
  const liveSessions = React.useMemo(
    () => sessions.filter((s) => s.calendar_id == null || !draftCalendarIds.has(s.calendar_id)),
    [sessions, draftCalendarIds],
  );
  // "Show drafts" is purely a display toggle - liveSessions above (used for
  // every conflict/gap check) never includes drafts regardless of it, so a
  // scheduler previewing a draft calendar's layout can't accidentally have
  // it silently treated as already-booked.
  const [showDrafts, setShowDrafts] = React.useState(false);
  const draftSessionIds = React.useMemo(
    () => new Set(sessions.filter((s) => s.calendar_id != null && draftCalendarIds.has(s.calendar_id)).map((s) => s.id)),
    [sessions, draftCalendarIds],
  );
  // Reintroduced per-calendar filtering (dropped when this view was
  // rebuilt) as an explicit, single-select choice - "All calendars" (null)
  // keeps today's showDrafts-gated behavior; picking one specific calendar
  // shows its sessions regardless of showDrafts, since choosing it by name
  // is itself the explicit ask to see it, draft or not.
  const [selectedCalendarId, setSelectedCalendarId] = React.useState<number | null>(null);
  const displaySessions = selectedCalendarId != null
    ? sessions.filter((s) => s.calendar_id === selectedCalendarId)
    : (showDrafts ? sessions : liveSessions);

  // Confirming a draft calendar was previously only reachable from the
  // Create wizard's very first step (hover a calendar pill there to reveal
  // a "Confirm" button) - completely disconnected from this tab, where
  // "Show drafts" already tells you drafts exist but gives no way to act on
  // it. A new calendar defaulting to "draft" (see CreateView.createCalendar)
  // meant every session ever booked into it stayed invisible here until
  // someone found that button, which read as "the calendar doesn't show
  // sessions" rather than "this one calendar needs to be confirmed."
  //
  // Only surfaced once there's no active calendar at all: once at least one
  // exists, sessions are showing somewhere by default and a leftover draft
  // (someone deliberately staging a batch, say) isn't something to keep
  // nagging about - the CalendarPicker dropdown lets anyone jump to it
  // directly whenever they want, warning or not.
  const hasActiveCalendar = React.useMemo(() => calendars.some((c) => c.status === "active"), [calendars]);
  const draftCalendars = React.useMemo(
    () => calendars.filter((c) => c.status === "draft"),
    [calendars],
  );
  const [confirmingCalendarId, setConfirmingCalendarId] = React.useState<number | null>(null);
  async function confirmDraftCalendar(cal: CalCalendar) {
    if (!confirm(`Confirm "${cal.name}"? Its sessions become visible on the live calendar immediately.`)) return;
    setConfirmingCalendarId(cal.id);
    const { data } = await supabase.from("calendars").update({ status: "active" }).eq("id", cal.id).select().single();
    setConfirmingCalendarId(null);
    if (data) {
      setCalendars((prev) => prev.map((c) => (c.id === cal.id ? data : c)));
      showToast(`${data.name} confirmed — now live on the calendar`);
    }
  }
  const visibleSessions = React.useMemo(
    () => displaySessions.filter((s) => matchesFilters(s as any, filters)),
    [displaySessions, filters],
  );

  const splitEmployeeIds = filters.employeeIds.size > 0 && filters.employeeIds.size <= SPLIT_THRESHOLD
    ? [...filters.employeeIds]
    : null;

  function go(direction: 1 | -1) {
    setAnchor((a) => shiftView(mode, a, direction, nDays));
  }
  function goToday() {
    setMode((m) => (m === "month" ? "month" : m));
    setAnchor(parseDateStr(todayDateStr()));
  }

  // ── Drag-to-reschedule ───────────────────────────────────────────────
  const [pendingDrag, setPendingDrag] = React.useState<{ session: CalSession; dateStr: string; hour: number; minute: number } | null>(null);

  function hasConflict(session: CalSession, dateStr: string, hour: number, minute: number): CalSession | undefined {
    return liveSessions.find(
      (b) => b.id !== session.id && b.employee_id === session.employee_id &&
        b.session_date === dateStr && b.hour === hour && b.minute === minute && b.status !== "cancelled",
    );
  }

  function toGapWindow(session: CalSession, dateStr: string, hour: number, minute: number): GapWindow {
    const st = sessionTypes.find((t) => t.name === session.type);
    return {
      sessionDate: dateStr,
      employeeId: session.employee_id,
      clientId: session.client_id,
      startMinutes: hour * 60 + minute,
      durationMinutes: sessionDuration(session, sessionTypes),
      gapBeforeMinutes: st?.gap_before_minutes ?? 0,
      gapAfterMinutes: st?.gap_after_minutes ?? 0,
    };
  }

  function findGapEncroachment(session: CalSession, dateStr: string, hour: number, minute: number): CalSession | undefined {
    const candidate = toGapWindow(session, dateStr, hour, minute);
    return liveSessions.find((b) => {
      if (b.id === session.id || b.status === "cancelled") return false;
      return gapsOverlap(candidate, toGapWindow(b, b.session_date, b.hour, b.minute));
    });
  }

  async function applyReschedule(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    // Re-check against the database right before writing, not just the
    // possibly-stale `liveSessions` state `hasConflict`/`findGapEncroachment`
    // already checked above - see lib/checkSlotConflict.ts for why this
    // doesn't fully close the race (that needs a DB constraint, logged in
    // BLOCKED-scheduler.md) but is still a real reduction of it.
    const fresh = await fetchFreshConflict(
      { employeeId: session.employee_id, dateStr, hour, minute },
      session.id,
    );
    if (fresh) {
      showToast("That slot was just booked by someone else - pick another time.");
      await loadRange();
      return;
    }

    // Track write failures rather than assuming success once the request is
    // sent - this previously never checked the update's own error, so a
    // rejected write (an RLS denial, a dropped connection) still showed
    // "Session rescheduled" and reloaded the grid as though nothing had
    // gone wrong, leaving the session silently unmoved.
    let failed = false;
    if (scope === "this" || !session.recurrence_id) {
      const { error } = await supabase.from("sessions").update({ session_date: dateStr, hour, minute }).eq("id", session.id);
      failed = !!error;
    } else {
      const { data: rows } = await supabase.from("sessions").select("*").eq("recurrence_id", session.recurrence_id);
      const oldDate = parseDateStr(session.session_date);
      const newDate = parseDateStr(dateStr);
      const dayDelta = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
      const targets = (rows || []).filter((r: any) => scope === "all" || r.session_date >= session.session_date);
      const results = await Promise.all(targets.map((r: any) => {
        const shifted = addDays(parseDateStr(r.session_date), dayDelta);
        return supabase.from("sessions").update({ session_date: toDateStr(shifted), hour, minute }).eq("id", r.id);
      }));
      failed = results.some((r) => r.error);
    }
    await loadRange();
    showToast(failed ? "Reschedule failed for one or more sessions - please check the calendar." : "Session rescheduled");
  }

  // Drag conflicts get suggestions too, but only the same-clinician kind:
  // dragging never reassigns who a session belongs to (see applyReschedule
  // above), so a different-clinician suggestion has no valid action here.
  const [pendingConflict, setPendingConflict] = React.useState<{
    session: CalSession; dateStr: string; hour: number; minute: number; scope: "this" | "following" | "all";
    message: string; suggestions: Suggestion[];
  } | null>(null);

  async function confirmAndApply(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    const conflict = hasConflict(session, dateStr, hour, minute);
    const gapHit = !conflict ? findGapEncroachment(session, dateStr, hour, minute) : undefined;
    const other = conflict || gapHit;
    if (other) {
      const emp = employees.find((e) => e.id === other.employee_id);
      const cl = clients.find((c) => c.id === other.client_id);
      const message = conflict
        ? `This overlaps with ${cl?.name || "another session"} for ${emp?.name || "this clinician"} at that time.`
        : `This lands inside the buffer time around ${cl?.name || "another session"}'s ${other.type}.`;
      const existing: ExistingSession[] = liveSessions
        .filter((s) => s.status !== "cancelled")
        .map((s) => ({ id: s.id, employee_id: s.employee_id, session_date: s.session_date, hour: s.hour, minute: s.minute, durationMinutes: sessionDuration(s, sessionTypes), status: s.status }));
      const suggestions = suggestSameClinicianOtherTime({
        employeeId: session.employee_id,
        employeeName: employees.find((e) => e.id === session.employee_id)?.name || "This clinician",
        dateStr, hour, minute, durationMinutes: sessionDuration(session, sessionTypes),
        excludeSessionId: session.id, sessions: existing, staffAvailability,
        workStartHour, workEndHour, incrementMinutes: activeSnapMinutes,
      });
      setPendingConflict({ session, dateStr, hour, minute, scope, message, suggestions });
      return;
    }
    await applyReschedule(session, dateStr, hour, minute, scope);
  }

  // Takes a session id (via dataTransfer), not a session object reference -
  // TimeGrid's drop target is a different DayColumn instance than the one
  // the drag started in whenever a session is dragged across days, so a
  // reference captured in the origin column's own local state/closure is
  // never visible to a different day's drop handler. Resolving the id
  // against this component's own `sessions` state means the lookup works no
  // matter which day column the drop lands in.
  function handleDropSession(sessionId: number, dateStr: string, hour: number, minute: number) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (session.session_date === dateStr && session.hour === hour && session.minute === minute) return;
    if (session.recurrence_id) {
      setPendingDrag({ session, dateStr, hour, minute });
    } else {
      void confirmAndApply(session, dateStr, hour, minute, "this");
    }
  }

  // Blank-calendar traps, called out in CLAUDE.md: a signed-in user whose
  // profiles row has no clinic_id (auth_clinic_id() returns null, every RLS
  // policy evaluates false) or has no profiles row at all sees a fully
  // rendered, silently empty calendar - no error, no matter what filters or
  // date range they try - which reads as "the calendar is broken" rather
  // than "this account needs attention." By the time this component is
  // reachable at all, _app.tsx's `loading` gate has already resolved
  // useUser()'s fetch, so a missing appUser or clinic_id here is settled
  // state, not a brief loading flicker.
  if (!appUser) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
        Your account profile couldn&apos;t be loaded, so no sessions can be shown. Try refreshing, or contact your administrator if this continues.
      </div>
    );
  }
  if (!clinicId) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
        Your account isn&apos;t assigned to a clinic yet, so no sessions can be shown. Contact your administrator to have your account linked to a clinic.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Calendar</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{range.label}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => go(-1)} style={navBtn}>‹</button>
          <button onClick={goToday} style={navBtn}>Today</button>
          <button onClick={() => go(1)} style={navBtn}>›</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <ModeButton active={mode === "day"} label="Day" onClick={() => setMode("day")} />
          <ModeButton active={mode === "week" && !weekendsInView} label="Work week" onClick={() => { setMode("week"); setWeekendsInView(false); }} />
          <ModeButton active={mode === "week" && weekendsInView} label="Full week" onClick={() => { setMode("week"); setWeekendsInView(true); }} />
          <ModeButton active={mode === "month"} label="Month" onClick={() => setMode("month")} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>Days:</span>
          <input
            type="number" min={1} max={7} value={nDays}
            onChange={(e) => { const v = Math.max(1, Math.min(7, Number(e.target.value) || 1)); setNDays(v); setMode("ndays"); setAnchor(parseDateStr(todayDateStr())); }}
            style={{ width: 44, padding: "5px 6px", borderRadius: 7, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13 }}
          />
        </div>

        <div style={{ marginLeft: 8 }}>
          <CalendarPicker calendars={calendars} selectedId={selectedCalendarId} onChange={setSelectedCalendarId} />
        </div>

        {draftCalendarIds.size > 0 && (
          <button
            onClick={() => setShowDrafts((v) => !v)}
            title="Preview draft calendars' sessions on this view - they still don't count toward conflict or gap checks until confirmed"
            style={{ ...navBtn, borderColor: showDrafts ? "#EF9F27" : undefined, color: showDrafts ? "#8A5E10" : undefined, background: showDrafts ? "#EF9F2718" : undefined }}
          >
            {showDrafts ? "Hide drafts" : "Show drafts"}
          </button>
        )}

        <div style={{ marginLeft: "auto" }}>
          <FilterPanel
            locations={locations} sessionTypes={sessionTypes} employees={employees} clients={clients}
            filters={filters} onChange={setFilters}
          />
        </div>
      </div>

      {draftCalendars.length > 0 && !hasActiveCalendar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", borderRadius: 8, background: "#EF9F2712", border: "0.5px solid #EF9F2755", marginBottom: 12, fontSize: 13 }}>
          <div style={{ color: "#8A5E10" }}>
            {draftCalendars.length === 1
              ? `"${draftCalendars[0].name}" is still a draft calendar - none of its sessions show here until it's confirmed.`
              : `${draftCalendars.length} calendars are still drafts - none of their sessions show here until confirmed.`}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {draftCalendars.map((cal) => (
              <button
                key={cal.id}
                onClick={() => void confirmDraftCalendar(cal)}
                disabled={confirmingCalendarId === cal.id}
                style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500,
                  border: "0.5px solid #5DCAA5", background: "#5DCAA5", color: "#fff",
                  cursor: confirmingCalendarId === cal.id ? "not-allowed" : "pointer",
                  opacity: confirmingCalendarId === cal.id ? 0.6 : 1,
                }}
              >
                {confirmingCalendarId === cal.id ? "Confirming…" : `Confirm "${cal.name}"`}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleSessions.length === 0 && activeFilterCount(filters) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", marginBottom: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
          No sessions match your filters for {range.label}.
          <button onClick={() => setFilters(emptyFilters())} style={{ fontSize: 13, color: "#3f9c78", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
            Clear filters
          </button>
        </div>
      )}

      {/* Every session fetch (loadRange) is scoped to the visible date range,
          not just active filters - the query itself is `.gte/.lte
          session_date` (migration 0018's sessions_clinic_date_idx). With no
          filters active, a blank grid here means "nothing in this range,"
          but nothing on screen says that, so it reads identically to a
          broken fetch. */}
      {visibleSessions.length === 0 && activeFilterCount(filters) === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", marginBottom: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
          No sessions found for {range.label}. If you expected to see one, check that it falls in this range - try Prev/Next, Today, or Month view to widen it.
        </div>
      )}

      {mode === "month" ? (
        <MonthGrid
          days={range.days} anchorMonth={anchor} sessions={visibleSessions} clients={clients} sessionTypes={sessionTypes}
          typeColors={typeColors} draftSessionIds={draftSessionIds}
          onSelectDay={(dateStr) => { setMode("day"); setAnchor(parseDateStr(dateStr)); }}
          onSessionClick={setSelected}
        />
      ) : (
        <div ref={gridAreaRef} style={{ height: "calc(100vh - var(--portalnav-h, 51px) - 230px)", minHeight: 320 }}>
          <TimeGrid
            days={range.days} sessions={visibleSessions} clients={clients} employees={employees} locations={locations}
            sessionTypes={sessionTypes} typeColors={typeColors} workStartHour={workStartHour} workEndHour={workEndHour}
            splitEmployeeIds={splitEmployeeIds} onSlotClick={onRequestCreate} onSessionClick={setSelected} onDropSession={handleDropSession}
            containerHeight={gridHeight} snapMinutes={activeSnapMinutes} gridlineMinutes={gridlineMinutes}
            dragHoverSlot={dragHoverSlot}
            onSessionDragStart={setDraggingSessionId}
            onDragHover={setDragHoverSlot}
            onDragEnd={() => { setDraggingSessionId(null); setDragHoverSlot(null); }}
            staffAvailability={staffAvailability} draggingEmployeeId={draggingSession?.employee_id ?? null}
            draftSessionIds={draftSessionIds} today={todayDateStr()}
          />
        </div>
      )}

      {selected && (
        <SessionDetail
          session={selected} clients={clients} employees={employees} locations={locations} typeColors={typeColors}
          isDraft={draftSessionIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onReschedule={() => { setRescheduling(selected); setSelected(null); }}
          onCancelled={() => { setSelected(null); void loadRange(); showToast("Session cancelled"); }}
        />
      )}

      {pendingDrag && (
        <RecurrenceScopeModal
          onPick={(scope) => { const p = pendingDrag; setPendingDrag(null); void confirmAndApply(p.session, p.dateStr, p.hour, p.minute, scope); }}
          onCancel={() => setPendingDrag(null)}
        />
      )}

      {pendingConflict && (
        <ConflictModal
          conflict={pendingConflict}
          onPickSuggestion={(s) => { const p = pendingConflict; setPendingConflict(null); void applyReschedule(p.session, s.dateStr, s.hour, s.minute, p.scope); }}
          onProceedAnyway={() => { const p = pendingConflict; setPendingConflict(null); void applyReschedule(p.session, p.dateStr, p.hour, p.minute, p.scope); }}
          onCancel={() => setPendingConflict(null)}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          session={rescheduling}
          client={clients.find((c) => c.id === rescheduling.client_id)}
          employees={employees} locations={locations} sessionTypes={sessionTypes}
          liveSessions={liveSessions} staffAvailability={staffAvailability} clientAvailability={clientAvailability}
          clinicId={clinicId}
          workStartHour={workStartHour} workEndHour={workEndHour} orgIncrementMinutes={orgIncrementMinutes}
          onClose={() => setRescheduling(null)}
          onSaved={(message) => { setRescheduling(null); void loadRange(); showToast(message); }}
        />
      )}
    </div>
  );
}

function ConflictModal({
  conflict, onPickSuggestion, onProceedAnyway, onCancel,
}: {
  conflict: { message: string; suggestions: Suggestion[] };
  onPickSuggestion: (s: Suggestion) => void;
  onProceedAnyway: () => void;
  onCancel: () => void;
}) {
  useEscapeToClose(onCancel);
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>Scheduling conflict</div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>{conflict.message}</p>
        {conflict.suggestions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.04em", marginBottom: 8 }}>SUGGESTED ALTERNATIVES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {conflict.suggestions.map((s, i) => (
                <button key={i} onClick={() => onPickSuggestion(s)} style={{ ...navBtn, width: "100%", textAlign: "left" }}>
                  {s.kind === "same-clinician" ? s.label : `${s.employeeName} — ${s.label}`}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onProceedAnyway} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#FCE8E8", color: "#A33A3A", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            Reschedule anyway
          </button>
          <button onClick={onCancel} style={navBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};


function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: active ? 500 : 400,
        border: `1px solid ${active ? "#5DCAA5" : "var(--color-border-tertiary)"}`,
        background: active ? "#5DCAA518" : "var(--color-background-primary)",
        color: active ? "#3f9c78" : "var(--color-text-primary)", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function RecurrenceScopeModal({ onPick, onCancel }: { onPick: (scope: "this" | "following" | "all") => void; onCancel: () => void }) {
  useEscapeToClose(onCancel);
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary)" }}>
          <RecurringIcon size={16} /> Move recurring session
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>This session repeats. What should the new time apply to?</p>
        {[
          { key: "this", label: "This session only" },
          { key: "following", label: "This and following sessions" },
          { key: "all", label: "All sessions in the series" },
        ].map((o) => (
          <button key={o.key} onClick={() => onPick(o.key as any)} style={{ ...navBtn, width: "100%", textAlign: "left", marginBottom: 6 }}>
            {o.label}
          </button>
        ))}
        <button onClick={onCancel} style={{ ...navBtn, width: "100%", marginTop: 4, color: "var(--color-text-secondary)" }}>Cancel</button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  width: 340, background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};

function SessionDetail({
  session, clients, employees, locations, typeColors, isDraft, onClose, onCancelled, onReschedule,
}: {
  session: CalSession; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  typeColors: Record<string, string>; isDraft: boolean; onClose: () => void; onCancelled: () => void; onReschedule: () => void;
}) {
  useEscapeToClose(onClose);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const client = clients.find((c) => c.id === session.client_id);
  const emp = employees.find((e) => e.id === session.employee_id);
  const loc = locations.find((l) => l.id === session.location_id);
  const color = typeColors[session.type] || "#888";

  async function handleCancel() {
    if (!confirm("Cancel this session?")) return;
    setCancelling(true);
    setCancelError(null);
    // Previously called onCancelled() (which closes this modal and shows a
    // success toast) regardless of whether the update actually succeeded -
    // optimistic UI with no failure path. Keep the modal open with an error
    // instead of reporting a cancellation that may not have happened.
    const { error } = await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session.id);
    setCancelling(false);
    if (error) { setCancelError("Cancel failed. Please try again."); return; }
    onCancelled();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, borderLeft: `4px solid ${color}` }} onClick={(e) => e.stopPropagation()}>
        {isDraft && (
          <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: "#8A5E10", background: "#EF9F2722", borderRadius: 5, padding: "2px 8px", marginBottom: 8 }}>
            DRAFT — not yet on the confirmed calendar
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{client?.name || "Unknown client"}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{emp?.name || "Unassigned"}</div>
        <DetailRow label="Date" value={session.session_date} />
        <DetailRow label="Time" value={`${String(session.hour).padStart(2, "0")}:${String(session.minute).padStart(2, "0")}`} />
        <DetailRow label="Location" value={session.is_home_visit ? (session.home_address || "Client's home") : (loc?.name || "—")} />
        <DetailRow label="Type" value={session.type} />
        <DetailRow label="Recurrence" value={session.recurrence_id ? "Recurring" : "One-time"} />
        {cancelError && <div style={{ fontSize: 13, color: "#A33A3A", marginTop: 8 }}>{cancelError}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={handleCancel} disabled={cancelling} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: cancelling ? "not-allowed" : "pointer", background: "#FCE8E8", color: "#A33A3A" }}>
            {cancelling ? "Cancelling..." : "Cancel session"}
          </button>
          <button onClick={onReschedule} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", background: "#5DCAA5", color: "#fff" }}>
            Reschedule
          </button>
          <button onClick={onClose} style={navBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

