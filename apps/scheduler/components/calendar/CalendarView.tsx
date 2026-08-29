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
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { FilterPanel, CalendarFilters, emptyFilters, matchesFilters } from "./FilterPanel";
import { RecurringIcon } from "./icons";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { sessionGridIncrement, sessionDuration } from "./types";

const SPLIT_THRESHOLD = 8;

interface Props {
  clients: CalClient[];
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  showToast: (msg?: string) => void;
  onRequestCreate: (dateStr: string, hour: number, minute: number) => void;
}

export function CalendarView({ clients, employees, locations, sessionTypes, typeColors, showToast, onRequestCreate }: Props) {
  const appUser = useAppUser();
  const clinicId = appUser?.clinic_id || "";
  const [mode, setMode] = React.useState<ViewMode>("week");
  const [weekendsInView, setWeekendsInView] = React.useState(false);
  const [nDays, setNDays] = React.useState(3);
  const [anchor, setAnchor] = React.useState<Date>(() => parseDateStr(todayDateStr()));
  const [sessions, setSessions] = React.useState<CalSession[]>([]);
  const [filters, setFilters] = React.useState<CalendarFilters>(emptyFilters());
  const [selected, setSelected] = React.useState<CalSession | null>(null);
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

  const visibleSessions = React.useMemo(
    () => sessions.filter((s) => matchesFilters(s as any, filters)),
    [sessions, filters],
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
    return sessions.find(
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
    return sessions.find((b) => {
      if (b.id === session.id || b.status === "cancelled") return false;
      return gapsOverlap(candidate, toGapWindow(b, b.session_date, b.hour, b.minute));
    });
  }

  async function applyReschedule(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    if (scope === "this" || !session.recurrence_id) {
      await supabase.from("sessions").update({ session_date: dateStr, hour, minute }).eq("id", session.id);
    } else {
      const { data: rows } = await supabase.from("sessions").select("*").eq("recurrence_id", session.recurrence_id);
      const oldDate = parseDateStr(session.session_date);
      const newDate = parseDateStr(dateStr);
      const dayDelta = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
      const targets = (rows || []).filter((r: any) => scope === "all" || r.session_date >= session.session_date);
      await Promise.all(targets.map((r: any) => {
        const shifted = addDays(parseDateStr(r.session_date), dayDelta);
        return supabase.from("sessions").update({ session_date: toDateStr(shifted), hour, minute }).eq("id", r.id);
      }));
    }
    await loadRange();
    showToast("Session rescheduled");
  }

  async function confirmAndApply(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    const conflict = hasConflict(session, dateStr, hour, minute);
    if (conflict) {
      const emp = employees.find((e) => e.id === conflict.employee_id);
      const cl = clients.find((c) => c.id === conflict.client_id);
      if (!confirm(`This overlaps with ${cl?.name || "another session"} for ${emp?.name || "this clinician"} at that time. Reschedule anyway?`)) return;
    } else {
      const gapHit = findGapEncroachment(session, dateStr, hour, minute);
      if (gapHit) {
        const cl = clients.find((c) => c.id === gapHit.client_id);
        if (!confirm(`This lands inside the buffer time around ${cl?.name || "another session"}'s ${gapHit.type}. Reschedule anyway?`)) return;
      }
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

        <div style={{ marginLeft: "auto" }}>
          <FilterPanel
            locations={locations} sessionTypes={sessionTypes} employees={employees} clients={clients}
            filters={filters} onChange={setFilters}
          />
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid
          days={range.days} anchorMonth={anchor} sessions={visibleSessions} clients={clients} sessionTypes={sessionTypes}
          typeColors={typeColors}
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
          />
        </div>
      )}

      {selected && (
        <SessionDetail
          session={selected} clients={clients} employees={employees} locations={locations} typeColors={typeColors}
          onClose={() => setSelected(null)}
          onCancelled={() => { setSelected(null); void loadRange(); showToast("Session cancelled"); }}
        />
      )}

      {pendingDrag && (
        <RecurrenceScopeModal
          onPick={(scope) => { const p = pendingDrag; setPendingDrag(null); void confirmAndApply(p.session, p.dateStr, p.hour, p.minute, scope); }}
          onCancel={() => setPendingDrag(null)}
        />
      )}
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
  session, clients, employees, locations, typeColors, onClose, onCancelled,
}: {
  session: CalSession; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  typeColors: Record<string, string>; onClose: () => void; onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = React.useState(false);
  const client = clients.find((c) => c.id === session.client_id);
  const emp = employees.find((e) => e.id === session.employee_id);
  const loc = locations.find((l) => l.id === session.location_id);
  const color = typeColors[session.type] || "#888";

  async function handleCancel() {
    if (!confirm("Cancel this session?")) return;
    setCancelling(true);
    await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session.id);
    setCancelling(false);
    onCancelled();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, borderLeft: `4px solid ${color}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{client?.name || "Unknown client"}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{emp?.name || "Unassigned"}</div>
        <DetailRow label="Date" value={session.session_date} />
        <DetailRow label="Time" value={`${String(session.hour).padStart(2, "0")}:${String(session.minute).padStart(2, "0")}`} />
        <DetailRow label="Location" value={session.is_home_visit ? (session.home_address || "Client's home") : (loc?.name || "—")} />
        <DetailRow label="Type" value={session.type} />
        <DetailRow label="Recurrence" value={session.recurrence_id ? "Recurring" : "One-time"} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={handleCancel} disabled={cancelling} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: cancelling ? "not-allowed" : "pointer", background: "#FCE8E8", color: "#A33A3A" }}>
            {cancelling ? "Cancelling..." : "Cancel session"}
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

