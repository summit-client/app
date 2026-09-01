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
import { StaffOverlayPicker, OverlayLegend, overlayColorFor } from "./StaffOverlayPicker";
import { RecurringIcon } from "./icons";
import { RescheduleModal } from "./RescheduleModal";
import { SessionDetail } from "./SessionDetail";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { sessionGridIncrement, sessionDuration } from "./types";
import { fetchFreshConflict, fetchFreshConflictKeys, slotKeyOf, isBookingConflictError } from "../../lib/checkSlotConflict";
import { useFocusTrap } from "../../lib/useFocusTrap";

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
  /** Set once, briefly, by a click on a client/clinician name in the
   *  Dashboard's Sessions list (see pages/index.jsx's focusPersonOnCalendar) -
   *  there's no per-person profile page anywhere in this app, so that click
   *  lands here instead: scope this tab to that person via the same
   *  filters/date-anchor a user could set by hand. */
  focus?: { employeeId?: number | null; clientId?: number | null; dateStr?: string | null } | null;
  /** Called once the incoming `focus` has been applied, so the parent can
   *  clear it - this view fully unmounts whenever pages/index.jsx's `view`
   *  switches away from "calendar" (see its `views` map), so without this
   *  a stale focus would silently reapply itself on the next visit to this
   *  tab even after someone had since cleared filters by hand. */
  onConsumedFocus?: () => void;
  /** Any new value (object/array identity change, not equality) re-runs
   *  this tab's own `sessions` fetch. This view keeps its own independent
   *  copy of the visible range's sessions (`loadRange` below) rather than
   *  reading the page-level `bookings` state directly - which meant a
   *  session booked elsewhere (click-to-create's quickSlot wizard calling
   *  refreshBookings()) never appeared here until something else happened
   *  to remount this tab or shift the date range (issue #133 item 8: "did
   *  a dummy click to create and I'm not seeing the listing populate").
   *  pages/index.jsx passes its own `bookings` array through here for
   *  exactly this purpose - a fresh array reference from any refetch is
   *  enough to trigger a reload, no dedicated counter needed. */
  refreshSignal?: unknown;
}

export function CalendarView({ clients, employees, locations, sessionTypes, typeColors, calendars, setCalendars, staffAvailability, clientAvailability, showToast, onRequestCreate, focus = null, onConsumedFocus, refreshSignal }: Props) {
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
  const [rescheduleInitialSlot, setRescheduleInitialSlot] = React.useState<{ dateStr: string; hour: number; minute: number } | null>(null);
  const [, forceTick] = React.useState(0);

  // Applied once on mount only (empty dep array - this component remounts
  // fresh on every navigation into this tab, per the comment on `focus`
  // above, so there is no later prop change to react to). Reads `focus` via
  // closure rather than as a dependency for exactly that reason.
  React.useEffect(() => {
    if (!focus) return;
    if (focus.employeeId != null || focus.clientId != null) {
      setFilters({
        ...emptyFilters(),
        employeeIds: focus.employeeId != null ? new Set([focus.employeeId]) : new Set(),
        clientIds: focus.clientId != null ? new Set([focus.clientId]) : new Set(),
      });
    }
    if (focus.dateStr) setAnchor(parseDateStr(focus.dateStr));
    onConsumedFocus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // refreshSignal is read only to force a refetch when it changes - see
    // the prop's own doc comment on why this tab can't just trust a stale
    // fetch from before the caller's most recent write.
  }, [clinicId, range.queryStart, range.queryEnd, filters, refreshSignal]);

  React.useEffect(() => {
    const t = setTimeout(() => { void loadRange(); }, 120);
    return () => clearTimeout(t);
  }, [loadRange]);

  // ── "Compare schedules" overlay ──────────────────────────────────────
  // Which OTHER staff members' sessions to layer on top of this view, and
  // that fetch's own result - kept entirely separate from `sessions`/
  // `loadRange` above rather than folded into the same query, because
  // loadRange's query is scoped by the viewer's own location/type/client/
  // employee filters (see FilterPanel) and the overlay is specifically
  // meant to show full, unfiltered detail for whoever is picked regardless
  // of what the viewer's own view is currently filtered down to - see
  // StaffOverlayPicker.tsx's header comment. Order is preserved (a Set
  // would not) since it is what overlayColorFor uses to keep one person's
  // colour stable while others are added or removed.
  const [overlayStaffIds, setOverlayStaffIds] = React.useState<number[]>([]);
  const [overlaySessions, setOverlaySessions] = React.useState<CalSession[]>([]);
  const overlayKey = overlayStaffIds.join(",");

  const loadOverlay = React.useCallback(async () => {
    if (!clinicId || overlayStaffIds.length === 0) { setOverlaySessions([]); return; }
    const { data } = await supabase.from("sessions").select("*")
      .eq("clinic_id", clinicId)
      .in("employee_id", overlayStaffIds)
      .gte("session_date", toDateStr(range.queryStart))
      .lte("session_date", toDateStr(range.queryEnd))
      .neq("status", "cancelled");
    setOverlaySessions((data as CalSession[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, overlayKey, range.queryStart, range.queryEnd, refreshSignal]);

  React.useEffect(() => {
    const t = setTimeout(() => { void loadOverlay(); }, 120);
    return () => clearTimeout(t);
  }, [loadOverlay]);

  function toggleOverlayStaff(id: number) {
    setOverlayStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function removeOverlayStaff(id: number) {
    setOverlayStaffIds((prev) => prev.filter((x) => x !== id));
  }
  function clearOverlay() {
    setOverlayStaffIds([]);
  }
  // Every place that used to just `await loadRange()` after writing a
  // session (reschedule, cancel) now needs the overlay's own separate fetch
  // refreshed too - an overlaid staff member's sessions live only in
  // `overlaySessions`, not in `sessions`/loadRange's result, so a write that
  // only reloaded loadRange would leave a just-moved overlay session
  // showing at its stale position until the next unrelated re-fetch.
  async function refreshAll() {
    await Promise.all([loadRange(), loadOverlay()]);
  }

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

  // Overlay sessions get the same live/draft treatment as the viewer's own
  // (respect "Show drafts"), but never the location/type/client/employee
  // filters above - see the overlay fetch's own comment for why.
  const overlayLiveOrShown = React.useMemo(
    () => (showDrafts ? overlaySessions : overlaySessions.filter((s) => s.calendar_id == null || !draftCalendarIds.has(s.calendar_id))),
    [overlaySessions, showDrafts, draftCalendarIds],
  );
  // One colour per overlaid person, keyed by session id so TimeGrid/
  // MonthGrid can recolour a block without knowing anything about staff or
  // overlays - see StaffOverlayPicker.tsx.
  const sessionColorOverrides = React.useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of overlayLiveOrShown) map[s.id] = overlayColorFor(s.employee_id, overlayStaffIds);
    return map;
  }, [overlayLiveOrShown, overlayStaffIds]);
  // Union by session id, overlay wins on collision (recolours a session that
  // would otherwise already be showing via the viewer's own filters) - this
  // is what actually puts the overlaid sessions on the grid; TimeGrid/
  // MonthGrid render whatever list they're handed with no separate overlay
  // concept of their own.
  const mergedSessions = React.useMemo(() => {
    if (overlayLiveOrShown.length === 0) return visibleSessions;
    const byId = new Map<number, CalSession>();
    for (const s of visibleSessions) byId.set(s.id, s);
    for (const s of overlayLiveOrShown) byId.set(s.id, s);
    return Array.from(byId.values());
  }, [visibleSessions, overlayLiveOrShown]);
  const draftSessionIds = React.useMemo(
    () => new Set(mergedSessions.filter((s) => s.calendar_id != null && draftCalendarIds.has(s.calendar_id)).map((s) => s.id)),
    [mergedSessions, draftCalendarIds],
  );

  const splitEmployeeIds = filters.employeeIds.size > 0 && filters.employeeIds.size <= SPLIT_THRESHOLD
    ? [...filters.employeeIds]
    : null;
  // Split-by-employee sub-columns bucket sessions strictly by the ids named
  // here; an overlaid staff member outside that set would otherwise vanish
  // from the grid entirely (their sessions match none of TimeGrid's
  // sub-columns rather than falling back to the shared one). Overlay and
  // split are two different ways of comparing several people at once -
  // this just picks overlay when both would otherwise apply, rather than
  // trying to reconcile the two layouts.
  const effectiveSplitEmployeeIds = overlayStaffIds.length > 0 ? null : splitEmployeeIds;

  // Resolved against mergedSessions (own + overlay), not just the viewer's
  // own `sessions` fetch, so starting a drag on an overlaid session's block
  // - same click-and-drag gesture as any other session on this grid, since
  // this is a full-detail overlay, not a read-only one - actually finds it
  // instead of silently no-op'ing (see handleDropSession below for the
  // write side of the same fix).
  const draggingSession = draggingSessionId != null ? mergedSessions.find((s) => s.id === draggingSessionId) : undefined;
  const activeSnapMinutes = sessionGridIncrement(draggingSession, sessionTypes, personalSnapMinutes);

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
      await refreshAll();
      return;
    }

    // Track write failures rather than assuming success once the request is
    // sent - this previously never checked the update's own error, so a
    // rejected write (an RLS denial, a dropped connection) still showed
    // "Session rescheduled" and reloaded the grid as though nothing had
    // gone wrong, leaving the session silently unmoved.
    let failed = false;
    // Set when the failure above was migration 0044's DB constraint
    // (unique index or overlap trigger) specifically, so the toast below can
    // show the same friendly conflict message the fresh pre-check above
    // already shows, rather than a raw "reschedule failed."
    let conflict = false;
    if (scope === "this" || !session.recurrence_id) {
      const { error } = await supabase.from("sessions").update({ session_date: dateStr, hour, minute }).eq("id", session.id);
      failed = !!error;
      conflict = isBookingConflictError(error);
    } else {
      const { data: rows } = await supabase.from("sessions").select("*").eq("recurrence_id", session.recurrence_id);
      const oldDate = parseDateStr(session.session_date);
      const newDate = parseDateStr(dateStr);
      const dayDelta = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
      const targets = (rows || []).filter((r: any) => scope === "all" || r.session_date >= session.session_date);
      const shiftedTargets = targets.map((r: any) => ({
        row: r,
        shiftedDateStr: toDateStr(addDays(parseDateStr(r.session_date), dayDelta)),
      }));

      // BLOCKED-scheduler.md previously logged this as a real, unfixed gap:
      // only the dragged session's own anchor slot was ever conflict-checked
      // above - every OTHER occurrence in a "following"/"all" shift wrote
      // with no check at all, so a multi-week series move could silently
      // double-book a later occurrence nothing here ever looked at.
      // All-or-nothing rather than the per-date skip pattern batch-booking
      // uses elsewhere: these rows are one series moving together, so
      // partially applying the shift (some occurrences moved, some silently
      // left behind at the old time) would leave the series split across
      // two times, which is worse than refusing the whole move. Known,
      // accepted limitation: fetchFreshConflictKeys has no per-candidate
      // exclusion (unlike fetchFreshConflict's excludeSessionId), so if two
      // occurrences of this same series happen to swap into each other's
      // still-unmoved pre-shift slot, this can report a false-positive
      // collision - fails safe (blocks the move) rather than silently
      // corrupting the series, which is the right tradeoff for something
      // this rare.
      const freshKeys = await fetchFreshConflictKeys(
        shiftedTargets.map(({ shiftedDateStr }) => ({ employeeId: session.employee_id, dateStr: shiftedDateStr, hour, minute })),
      );
      const collision = shiftedTargets.find(({ shiftedDateStr }) =>
        freshKeys.has(slotKeyOf({ employeeId: session.employee_id, dateStr: shiftedDateStr, hour, minute })),
      );
      if (collision) {
        showToast(`Can't move the series - ${collision.shiftedDateStr} already has a session at that time.`);
        await refreshAll();
        return;
      }

      const results = await Promise.all(shiftedTargets.map(({ row, shiftedDateStr }) =>
        supabase.from("sessions").update({ session_date: shiftedDateStr, hour, minute }).eq("id", row.id),
      ));
      failed = results.some((r) => r.error);
      conflict = results.some((r) => isBookingConflictError(r.error));
    }
    await refreshAll();
    showToast(
      !failed
        ? "Session rescheduled"
        : conflict
          ? "That slot was just booked by someone else - pick another time."
          : "Reschedule failed for one or more sessions - please check the calendar.",
    );
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
    // mergedSessions, not just `sessions` - a dropped session may belong to
    // an overlaid staff member and only exist in `overlaySessions`. RLS is
    // still what actually decides whether the write is allowed (see
    // migrations 0013/0014); this only decides whether the drop resolves to
    // a session at all instead of silently doing nothing.
    const session = mergedSessions.find((s) => s.id === sessionId);
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
          <button aria-label="Previous" onClick={() => go(-1)} style={navBtn}>‹</button>
          <button onClick={goToday} style={navBtn}>Today</button>
          <button aria-label="Next" onClick={() => go(1)} style={navBtn}>›</button>
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

        <StaffOverlayPicker
          employees={employees} selectedIds={overlayStaffIds}
          onToggle={toggleOverlayStaff} onClearAll={clearOverlay}
        />

        <div style={{ marginLeft: "auto" }}>
          <FilterPanel
            locations={locations} sessionTypes={sessionTypes} employees={employees} clients={clients}
            filters={filters} onChange={setFilters}
          />
        </div>
      </div>

      <OverlayLegend employees={employees} selectedIds={overlayStaffIds} onRemove={removeOverlayStaff} />

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

      {mergedSessions.length === 0 && activeFilterCount(filters) > 0 && (
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
          broken fetch. mergedSessions (not visibleSessions) so this doesn't
          fire while an overlay is actually showing something. */}
      {mergedSessions.length === 0 && activeFilterCount(filters) === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", marginBottom: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
          No sessions found for {range.label}. If you expected to see one, check that it falls in this range - try Prev/Next, Today, or Month view to widen it.
        </div>
      )}

      {mode === "month" ? (
        <MonthGrid
          days={range.days} anchorMonth={anchor} sessions={mergedSessions} clients={clients} sessionTypes={sessionTypes}
          typeColors={typeColors} draftSessionIds={draftSessionIds} sessionColorOverrides={sessionColorOverrides}
          onSelectDay={(dateStr) => { setMode("day"); setAnchor(parseDateStr(dateStr)); }}
          onSessionClick={setSelected}
        />
      ) : (
        <div ref={gridAreaRef} style={{ height: "calc(100vh - var(--portalnav-h, 51px) - 230px)", minHeight: 320 }}>
          <TimeGrid
            days={range.days} sessions={mergedSessions} clients={clients} employees={employees} locations={locations}
            sessionTypes={sessionTypes} typeColors={typeColors} workStartHour={workStartHour} workEndHour={workEndHour}
            splitEmployeeIds={effectiveSplitEmployeeIds} onSlotClick={onRequestCreate} onSessionClick={setSelected} onDropSession={handleDropSession}
            containerHeight={gridHeight} snapMinutes={activeSnapMinutes} gridlineMinutes={gridlineMinutes}
            dragHoverSlot={dragHoverSlot}
            onSessionDragStart={setDraggingSessionId}
            onDragHover={setDragHoverSlot}
            onDragEnd={() => { setDraggingSessionId(null); setDragHoverSlot(null); }}
            staffAvailability={staffAvailability} draggingEmployeeId={draggingSession?.employee_id ?? null}
            draftSessionIds={draftSessionIds} today={todayDateStr()}
            sessionColorOverrides={sessionColorOverrides}
          />
        </div>
      )}

      {selected && (
        <SessionDetail
          session={selected} clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes} typeColors={typeColors}
          colorOverride={sessionColorOverrides[selected.id]}
          isDraft={draftSessionIds.has(selected.id)}
          staffAvailability={staffAvailability} clientAvailability={clientAvailability}
          clinicId={clinicId} workStartHour={workStartHour} workEndHour={workEndHour} incrementMinutes={orgIncrementMinutes}
          onClose={() => setSelected(null)}
          onReschedule={(proposedSlot) => { setRescheduleInitialSlot(proposedSlot || null); setRescheduling(selected); setSelected(null); }}
          onCancelled={() => { setSelected(null); void refreshAll(); showToast("Session cancelled"); }}
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
          initialSlot={rescheduleInitialSlot}
          onClose={() => { setRescheduling(null); setRescheduleInitialSlot(null); }}
          onSaved={(message) => { setRescheduling(null); setRescheduleInitialSlot(null); void refreshAll(); showToast(message); }}
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
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Scheduling conflict" style={modalStyle} onClick={(e) => e.stopPropagation()}>
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
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Move recurring session" style={modalStyle} onClick={(e) => e.stopPropagation()}>
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

