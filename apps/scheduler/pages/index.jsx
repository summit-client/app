import { useState, useEffect, useRef, useMemo, useContext, Fragment } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";
import { UserContext } from "../lib/UserContext";
import Sidebar from "../components/Sidebar";
import SessionTypeEditModal from "../components/SessionTypeEditModal";
import { CalendarView } from "../components/calendar/CalendarView";
import { SessionDetail } from "../components/calendar/SessionDetail";
import { RescheduleModal } from "../components/calendar/RescheduleModal";
import { gapsOverlap, parseTimeSetting, toDateStr, todayDateStr } from "../components/calendar/dateUtils";
import { suggestSameClinicianOtherTime, suggestDifferentClinicianSameSlot } from "../components/calendar/suggestions";
import { getSetting, setSetting, onSettingsChange } from "@summit/settings";
import { refreshUrl } from "@summit/portals";
import { fetchFreshConflict, fetchFreshConflictKeys, slotKeyOf } from "../lib/checkSlotConflict";
import { useFocusTrap } from "../lib/useFocusTrap";

const COLORS = {
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  bgT: "var(--color-background-tertiary)",
  border: "var(--color-border-tertiary)",
  borderS: "var(--color-border-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
  textT: "var(--color-text-tertiary)",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AVAIL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELL_H = 22;

// ─── Time helpers ─────────────────────────────────────────────────────────────

function dayFromDate(dateStr) {
  const DAY_MAP = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DAY_MAP[new Date(dateStr + "T12:00:00").getDay()];
}

// Previously hardcoded 7am-8pm regardless of clinic - CalendarView.tsx's
// real calendar grid already reads calendar.workStart/workEnd from
// @summit/settings per clinic, but this wizard's own preview/availability-
// editing grids (PreviewGrid, AvailabilityGrid below) didn't. Fixed by
// parametrizing on startHour/endHour instead of a module-level constant -
// every caller now derives these from the workStart/workEnd props already
// threaded down from Scheduler() (the top-level component, which already
// subscribes to onSettingsChange for exactly this reason - see its own
// comment), matching how PreviewGrid already filters its day columns by the
// workDays prop rather than assuming a fixed set.
function generateTimeSlots(startHour, endHour) {
  const s = [];
  for (let h = startHour; h < endHour; h++) {
    s.push(`${String(h).padStart(2, "0")}:00`);
    s.push(`${String(h).padStart(2, "0")}:30`);
  }
  return s;
}

function buildPreviewSlots(startHour, endHour) {
  const s = [];
  for (let h = startHour; h < endHour; h++) {
    s.push({ h, m: 0, label: `${h}:00`, key: `${String(h).padStart(2, "0")}:00` });
    s.push({ h, m: 30, label: "", key: `${String(h).padStart(2, "0")}:30` });
  }
  return s;
}

function availToSlots(avail, timeSlots) {
  const sel = new Set();
  (avail || []).forEach(({ day, start_time, end_time }) => {
    const s = String(start_time).substring(0, 5);
    const e = String(end_time).substring(0, 5);
    timeSlots.forEach(t => { if (t >= s && t < e) sel.add(`${day}-${t}`); });
  });
  return sel;
}

function slotsToRanges(selected, entityId, entityType, availDays, timeSlots, endOfDayTime) {
  const idField = entityType === "staff" ? "staff_id" : "client_id";
  const result = [];
  availDays.forEach(day => {
    const daySlots = timeSlots.filter(t => selected.has(`${day}-${t}`));
    if (!daySlots.length) return;
    let start = daySlots[0], prev = daySlots[0];
    for (let i = 1; i <= daySlots.length; i++) {
      const curr = daySlots[i];
      const pi = timeSlots.indexOf(prev), ci = curr ? timeSlots.indexOf(curr) : -1;
      if (ci === pi + 1) { prev = curr; } else {
        const ei = timeSlots.indexOf(prev) + 1;
        result.push({ [idField]: entityId, day, start_time: start, end_time: ei < timeSlots.length ? timeSlots[ei] : endOfDayTime });
        if (curr) { start = curr; prev = curr; }
      }
    }
  });
  return result;
}

function parseSlot(slot) {
  if (!slot) return { day: "Mon", hour: 9, minute: 0 };
  const DAY_MAP = {
    mon: "Mon", monday: "Mon", tue: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed", thu: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri", sat: "Sat", saturday: "Sat",
  };
  const cleaned = slot.replace(/,/g, " ").trim();
  const parts = cleaned.split(/\s+/);
  const dayKey = (parts[0] || "mon").toLowerCase().replace(/[^a-z]/g, "");
  const day = DAY_MAP[dayKey] || DAY_MAP[dayKey.substring(0, 3)] || "Mon";
  const timeRange = parts[1] || "9:00";
  const startTime = timeRange.split("-")[0].replace(/[^0-9:]/g, "");
  const [hStr, mStr = "0"] = startTime.split(":");
  const hour = Math.max(7, Math.min(19, parseInt(hStr) || 9));
  const minute = parseInt(mStr) >= 30 ? 30 : 0;
  return { day, hour, minute };
}

function generateRecurringDates(calStart, calEnd, dayOfWeek, endType, endDate, endCount) {
  const DAY_MAP = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const target = DAY_MAP[dayOfWeek] ?? 1;
  const start = new Date(calStart + "T12:00:00");
  const absEnd = (endType === "date" && endDate)
    ? new Date(endDate + "T12:00:00")
    : new Date(calEnd + "T12:00:00");
  let cur = new Date(start);
  cur.setDate(cur.getDate() + (target - cur.getDay() + 7) % 7);
  const dates = [], max = endType === "count" ? Number(endCount) : 9999;
  while (cur <= absEnd && dates.length < max) {
    // toDateStr (local Y/M/D), not toISOString - the latter converts to UTC
    // first, which can land on the wrong calendar day depending on the
    // browser's timezone offset even though `cur` is deliberately noon-
    // anchored to dodge exactly that. Matches the one convention this app
    // already uses everywhere else (see dateUtils.ts's file header).
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

// Same weekly-stepping idea as generateRecurringDates, but anchored on an
// exact clicked date instead of a calendar term's own start - that function
// always returns the FIRST occurrence of dayOfWeek on/after calStart, which
// for an ongoing term is very unlikely to be the date someone actually
// clicked on the real calendar. Only the click-to-create quick-slot flow
// uses this; every other booking path in this wizard is day-of-week +
// term-relative by design, not exact-date.
function generateDatesFrom(startDateStr, endType, endDate, endCount) {
  const dates = [];
  const cur = new Date(startDateStr + "T12:00:00");
  const absEnd = endType === "date" && endDate ? new Date(endDate + "T12:00:00") : new Date("2999-12-31T12:00:00");
  const max = endType === "count" ? Number(endCount) : 9999;
  while (cur <= absEnd && dates.length < max) {
    // See generateRecurringDates above for why toDateStr, not toISOString.
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

function staffAvailAt(staffId, day, timeKey, staffAvailability) {
  return (staffAvailability || [])
    .filter(a => a.staff_id === staffId && a.day === day)
    .some(a => {
      const s = String(a.start_time).substring(0, 5);
      const e = String(a.end_time).substring(0, 5);
      return timeKey >= s && timeKey < e;
    });
}

function clientAvailAt(clientId, day, timeKey, clientAvailability) {
  return (clientAvailability || [])
    .filter(a => a.client_id === clientId && a.day === day)
    .some(a => {
      const s = String(a.start_time).substring(0, 5);
      const e = String(a.end_time).substring(0, 5);
      return timeKey >= s && timeKey < e;
    });
}

// ─── Generic availability drag grid ──────────────────────────────────────────

function AvailabilityGrid({ entityId, entityType, existingAvailability, onSave, onCancel, workStart, workEnd, workDays }) {
  // Previously always rendered a fixed Mon-Sat/7am-8pm grid, unrelated to
  // what the clinic actually configured in Settings - CalendarView.tsx's
  // real calendar has honored calendar.workDays/workStart/workEnd for a
  // while; this editor didn't, so it was possible to mark availability on a
  // day/hour the clinic never schedules against at all. availDays mirrors
  // PreviewGrid's own workDays-filter of the same Mon-Sat ordering.
  const availDays = AVAIL_DAYS.filter(d => workDays.includes(d));
  const timeSlots = useMemo(() => generateTimeSlots(workStart, workEnd), [workStart, workEnd]);
  const endOfDayTime = `${String(workEnd).padStart(2, "0")}:00`;
  const [selected, setSelected] = useState(() => availToSlots(existingAvailability, timeSlots));
  const [saving, setSaving] = useState(false);
  const dragRef = useRef({ active: false, mode: null });
  const appUser = useContext(UserContext);

  const tableName = entityType === "staff" ? "staff_availability" : "client_availability";
  const idField = entityType === "staff" ? "staff_id" : "client_id";

  function handleMouseDown(key) {
    const mode = selected.has(key) ? "remove" : "add";
    dragRef.current = { active: true, mode };
    setSelected(prev => { const n = new Set(prev); mode === "remove" ? n.delete(key) : n.add(key); return n; });
  }
  function handleMouseEnter(key) {
    if (!dragRef.current.active) return;
    setSelected(prev => { const n = new Set(prev); dragRef.current.mode === "remove" ? n.delete(key) : n.add(key); return n; });
  }
  function handleMouseUp() { dragRef.current.active = false; }
  // Drag-select has no keyboard equivalent, and these cells were plain divs
  // with no tabIndex/role/keydown handler at all - a keyboard-only user
  // could not reach or toggle a single slot here. A single-slot toggle (no
  // drag-range semantics) is the reasonable keyboard equivalent.
  function handleKeyToggle(e, key) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function handleSave() {
    setSaving(true);
    const ranges = slotsToRanges(selected, entityId, entityType, availDays, timeSlots, endOfDayTime).map(r => ({ ...r, clinic_id: appUser.clinic_id }));
    await supabase.from(tableName).delete().eq(idField, entityId);
    if (ranges.length) await supabase.from(tableName).insert(ranges);
    setSaving(false);
    onSave(entityId, ranges);
  }

  return (
    <div onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      style={{ userSelect: "none", marginTop: 16, padding: 16, borderRadius: 10, background: COLORS.bg, border: `0.5px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.textS, marginBottom: 10 }}>
        Drag to set availability · {selected.size} × 30-min slots
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${availDays.length}, 1fr)`, gap: 2, marginBottom: 4 }}>
        <div />
        {availDays.map(d => <div key={d} style={{ fontSize: 12, fontWeight: 500, color: COLORS.textS, textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${availDays.length}, 1fr)`, gap: 2 }}>
        {timeSlots.map(t => (
          <>
            <div key={`l-${t}`} style={{ fontSize: 10, color: COLORS.textT, textAlign: "right", paddingRight: 6, height: 14, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {t.endsWith(":00") ? t : ""}
            </div>
            {availDays.map(day => {
              const key = `${day}-${t}`, on = selected.has(key);
              return <div key={key} onMouseDown={() => handleMouseDown(key)} onMouseEnter={() => handleMouseEnter(key)}
                role="checkbox" aria-checked={on} aria-label={`${day} ${t}`} tabIndex={0}
                onKeyDown={(e) => handleKeyToggle(e, key)}
                style={{ height: 14, borderRadius: 2, cursor: "pointer", background: on ? "#5DCAA5" : COLORS.bgT, border: `0.5px solid ${on ? "#5DCAA544" : COLORS.border}`, transition: "background 0.05s" }} />;
            })}
          </>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 18px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          {saving ? "Saving…" : "Save availability"}
        </button>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, background: COLORS.bg, color: COLORS.textS, border: `0.5px solid ${COLORS.border}`, cursor: "pointer", fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Preview Grid ─────────────────────────────────────────────────────────────

function PreviewGrid({ proposedSessions, setProposedSessions, existingSessions, staffAvailability, clientAvailability, employees, clients, locations, sessionTypes, unmatchedClients, typeColors, workDays, workStart, workEnd }) {
  // Already correctly filtered its day columns by workDays; the hour range
  // was still the hardcoded 7am-8pm PREVIEW_SLOTS constant regardless of
  // what the clinic actually configured. Now derives from the same
  // workStart/workEnd props CalendarView.tsx's real calendar already reads.
  const previewSlots = useMemo(() => buildPreviewSlots(workStart, workEnd), [workStart, workEnd]);
  const [filterLocId, setFilterLocId] = useState(null);
  const [filterStaffIds, setFilterStaffIds] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragKeyRef = useRef(null);
  const dropTargetRef = useRef(null);

  useEffect(() => { dropTargetRef.current = dropTarget; }, [dropTarget]);

  const doDropRef = useRef(null);
  doDropRef.current = () => {
    const key = dragKeyRef.current;
    const target = dropTargetRef.current;
    if (key && target) {
      const ps = proposedSessions.find(p => p.key === key);
      if (ps?.staffId && staffAvailAt(ps.staffId, target.day, target.tKey, staffAvailability)) {
        const [hStr, mStr] = target.tKey.split(":");
        setProposedSessions(prev => prev.map(p => p.key === key ? { ...p, day: target.day, hour: parseInt(hStr), minute: parseInt(mStr) } : p));
      }
    }
    dragKeyRef.current = null;
    setGhost(null);
    setDropTarget(null);
  };

  useEffect(() => {
    function onUp() { doDropRef.current?.(); }
    function onMove(e) { if (dragKeyRef.current) setGhost(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null); }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mouseup", onUp); window.removeEventListener("mousemove", onMove); };
  }, []);

  function startDrag(e, ps) {
    e.preventDefault();
    dragKeyRef.current = ps.key;
    setGhost({ x: e.clientX, y: e.clientY, name: ps.clientName, color: ps.color });
    setTooltip(null);
  }

  const involvedStaffIds = [...new Set(proposedSessions.map(p => p.staffId).filter(Boolean))];
  const involvedStaff = involvedStaffIds.map(id => employees.find(e => e.id === id)).filter(Boolean);
  const involvedLocIds = [...new Set(proposedSessions.map(p => p.locationId).filter(Boolean))];
  const involvedLocs = involvedLocIds.map(id => locations.find(l => l.id === id)).filter(Boolean);
  const displayStaffIds = filterStaffIds.length > 0 ? filterStaffIds : involvedStaffIds;

  function cellAvail(day, tKey) { return displayStaffIds.some(id => staffAvailAt(id, day, tKey, staffAvailability)); }
  function getProposedAt(day, h, m) { return proposedSessions.filter(p => p.day === day && p.hour === h && p.minute === m); }
  // existingSessions no longer have a .day column — derive from session_date
  function getExistingAt(day, h) {
    return (existingSessions || []).filter(s => dayFromDate(s.session_date) === day && s.hour === h);
  }

  function getCellDragState(day, tKey, dragPs) {
    if (!dragPs) return "normal";
    const sAvail = dragPs.staffId && staffAvailAt(dragPs.staffId, day, tKey, staffAvailability);
    if (!sAvail) return "blocked";
    const hasClientAvail = (clientAvailability || []).some(a => a.client_id === dragPs.clientId);
    if (!hasClientAvail) return "green";
    const cAvail = clientAvailAt(dragPs.clientId, day, tKey, clientAvailability);
    const anyStaffAvail = employees.some(e =>
      e.specialties?.includes(dragPs.sessionType) && staffAvailAt(e.id, day, tKey, staffAvailability)
    );
    if (sAvail && cAvail) return "green";
    if (cAvail && anyStaffAvail) return "yellow";
    return "normal";
  }

  const isDragging = !!ghost;
  const dragPs = isDragging && dragKeyRef.current ? proposedSessions.find(p => p.key === dragKeyRef.current) : null;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: COLORS.textS }}>View:</span>
        <select value={filterLocId || ""} onChange={e => { setFilterLocId(e.target.value ? Number(e.target.value) : null); setFilterStaffIds([]); }}
          style={{ padding: "4px 8px", borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 }}>
          <option value="">All locations</option>
          {involvedLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {involvedStaff.filter(e => !filterLocId || e.location_id === filterLocId).map(e => {
          const sel = filterStaffIds.includes(e.id);
          return <button key={e.id} onClick={() => setFilterStaffIds(prev => sel ? prev.filter(id => id !== e.id) : [...prev, e.id])}
            style={{ padding: "3px 12px", borderRadius: 20, fontSize: 12, border: `1px solid ${sel ? "#378ADD" : COLORS.border}`, background: sel ? "#378ADD22" : COLORS.bg, color: sel ? "#378ADD" : COLORS.textS, cursor: "pointer", fontWeight: sel ? 500 : 400 }}>
            {e.name.split(" ").slice(-1)[0]}
          </button>;
        })}
        {isDragging && (
          <div style={{ display: "flex", gap: 12, marginLeft: 8 }}>
            <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#5DCAA5" }} />Staff + client available</span>
            <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#EF9F27" }} />Client + any staff</span>
          </div>
        )}
      </div>

      {/* Grid */}
      <div style={{ overflowX: "auto", marginBottom: 16, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ minWidth: 520 }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px repeat(6, 1fr)", background: COLORS.bgS, borderBottom: `0.5px solid ${COLORS.border}` }}>
            <div />
            {DAYS.map(d => <div key={d} style={{ padding: "6px 0", textAlign: "center", fontSize: 13, fontWeight: 500, color: COLORS.textS, borderLeft: `0.5px solid ${COLORS.border}` }}>{d}</div>)}
          </div>
          {previewSlots.map(({ h, m, label, key: tKey }) => (
            <div key={tKey} style={{ display: "grid", gridTemplateColumns: "44px repeat(6, 1fr)", borderBottom: `0.5px solid ${m === 0 ? COLORS.border : COLORS.border + "55"}` }}>
              <div style={{ height: CELL_H, background: COLORS.bgS, fontSize: 10, color: COLORS.textT, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 5 }}>{label}</div>
              {DAYS.filter(d => workDays.includes(d)).map(day => {
                const avail = cellAvail(day, tKey);
                const proposed = getProposedAt(day, h, m);
                const existing = m === 0 ? getExistingAt(day, h) : [];
                const isDropTarget = isDragging && dropTarget?.day === day && dropTarget?.tKey === tKey;
                const dragState = isDragging ? getCellDragState(day, tKey, dragPs) : "normal";
                const canDrop = dragState !== "blocked" && dragPs?.staffId && staffAvailAt(dragPs.staffId, day, tKey, staffAvailability);

                let bg;
                if (isDragging) {
                  if (dragState === "green") bg = "#5DCAA522";
                  else if (dragState === "yellow") bg = "#EF9F2722";
                  else if (dragState === "blocked") bg = COLORS.bgT;
                  else bg = COLORS.bg;
                } else {
                  bg = !avail ? COLORS.bgT : COLORS.bg;
                }
                if (isDropTarget) {
                  if (canDrop) bg = "#5DCAA544";
                  else bg = "#E24B4A22";
                }

                return (
                  <div key={`${day}-${tKey}`}
                    onMouseEnter={() => { if (isDragging) setDropTarget({ day, tKey }); }}
                    onMouseMove={e => {
                      if (isDragging) return;
                      const p = proposed[0], ex = existing[0];
                      if (p || ex) setTooltip({
                        x: e.clientX + 14, y: e.clientY + 10,
                        proposed: p ? { name: p.clientName, staff: p.staffName, type: p.sessionType, loc: locations.find(l => l.id === p.locationId)?.name, time: `${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` } : null,
                        existing: ex ? { name: clients.find(c => c.id === ex.client_id)?.name, staff: employees.find(e => e.id === ex.employee_id)?.name, type: ex.type, time: `${day} ${h}:00` } : null,
                      });
                    }}
                    onMouseLeave={() => { if (!isDragging) setTooltip(null); }}
                    style={{ height: CELL_H, borderLeft: `0.5px solid ${COLORS.border}`, position: "relative", background: bg, cursor: isDragging ? (canDrop ? "copy" : "no-drop") : "default", transition: "background 0.06s" }}>
                    {proposed.map(ps => (
                      <div key={ps.key} onMouseDown={e => startDrag(e, ps)} onMouseLeave={() => setTooltip(null)}
                        style={{ position: "absolute", inset: "1px 1px 0", borderRadius: 3, zIndex: 2, overflow: "hidden", background: ps.color + (dragKeyRef.current === ps.key ? "44" : "99"), borderLeft: `3px solid ${ps.color}`, fontSize: 11, color: "#fff", fontWeight: 600, padding: "1px 4px", display: "flex", alignItems: "center", cursor: "grab", userSelect: "none", opacity: dragKeyRef.current === ps.key ? 0.4 : 1 }}>
                        {ps.clientName?.split(" ")[0]}
                      </div>
                    ))}
                    {existing.map((s, idx) => {
                      const c = typeColors[s.type] || "#888888";
                      return <div key={idx} style={{ position: "absolute", inset: "1px 1px 0", top: idx * 10 + 1, borderRadius: 3, background: c + "44", borderLeft: `3px solid ${c}88`, fontSize: 10, color: c, fontWeight: 500, padding: "1px 3px", overflow: "hidden", display: "flex", alignItems: "center" }}>
                        {clients.find(cl => cl.id === s.client_id)?.name?.split(" ")[0]}
                      </div>;
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Drag ghost */}
      {ghost && <div style={{ position: "fixed", left: ghost.x + 10, top: ghost.y - 14, pointerEvents: "none", zIndex: 9999, background: ghost.color + "ee", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#fff", fontWeight: 600, boxShadow: "0 4px 14px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>{ghost.name?.split(" ")[0]}</div>}

      {/* Tooltip */}
      {tooltip && !isDragging && (
        <div style={{ position: "fixed", left: tooltip.x, top: tooltip.y, background: COLORS.bg, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, zIndex: 1000, pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", minWidth: 148 }}>
          {tooltip.proposed && <div style={{ marginBottom: tooltip.existing ? 8 : 0 }}>
            <div style={{ fontSize: 11, color: "#5DCAA5", fontWeight: 600, marginBottom: 3 }}>PROPOSED</div>
            <div style={{ fontWeight: 500, color: COLORS.text }}>{tooltip.proposed.name}</div>
            <div style={{ color: COLORS.textS }}>{tooltip.proposed.staff}</div>
            <div style={{ color: COLORS.textS }}>{tooltip.proposed.type}</div>
            {tooltip.proposed.loc && <div style={{ color: COLORS.textT }}>{tooltip.proposed.loc}</div>}
            <div style={{ color: COLORS.textT, marginTop: 2 }}>{tooltip.proposed.time}</div>
          </div>}
          {tooltip.existing && <div>
            <div style={{ fontSize: 11, color: COLORS.textS, fontWeight: 600, marginBottom: 3 }}>EXISTING</div>
            <div style={{ fontWeight: 500, color: COLORS.text }}>{tooltip.existing.name}</div>
            <div style={{ color: COLORS.textS }}>{tooltip.existing.staff}</div>
            <div style={{ color: COLORS.textS }}>{tooltip.existing.type}</div>
            <div style={{ color: COLORS.textT, marginTop: 2 }}>{tooltip.existing.time}</div>
          </div>}
        </div>
      )}

      {/* Unmatched */}
      {unmatchedClients?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 8 }}>Could not be matched</div>
          {unmatchedClients.map((u, i) => (
            <div key={i} style={{ padding: "9px 14px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", fontSize: 13, display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontWeight: 500, color: "#A32D2D" }}>{u.clientName}</span>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: (typeColors[u.sessionType] || "#888888") + "22", color: typeColors[u.sessionType] || "#888888", border: `1px solid ${(typeColors[u.sessionType] || "#888888")}44` }}>{u.sessionType}</span>
              {u.reason && <span style={{ color: "#C25555" }}>— {u.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, padding: "10px 18px", borderRadius: 10, background: COLORS.bg, border: `0.5px solid #5DCAA5`, boxShadow: "0 4px 16px rgba(0,0,0,0.14)", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: COLORS.text, animation: "fadeInDown 0.2s ease" }}>
      <span style={{ color: "#5DCAA5", fontSize: 15 }}>✓</span>
      {message}
    </div>
  );
}

function Avatar({ name, size = 32, color = "#5DCAA5" }) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2);
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color + "22", border: `1.5px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 500, color, flexShrink: 0 }}>{initials}</div>;
}

function Badge({ label, color }) {
  return <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 10px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}44` }}>{label}</span>;
}

// Neither clients nor staff have a detail/profile page anywhere in this app
// (confirmed by searching pages/ and admin.tsx before adding this) - so a
// name click resolves to the smaller, already-existing "scope the real
// calendar to this person" mechanism (CalendarView's own filters) instead of
// a bespoke profile screen. Renders as plain text when there's nothing to
// link to (no id/onClick), matching how {client?.name}/{emp?.name} rendered
// before this - a session with a dangling client_id/employee_id shows "—"
// rather than a broken control.
function PersonLink({ name, onClick, size = 14, weight = 500, color }) {
  const c = color || COLORS.text;
  if (!name || !onClick) {
    return <span style={{ fontSize: size, fontWeight: weight, color: c }}>{name || "—"}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="person-link"
      style={{ fontSize: size, fontWeight: weight, color: c, fontFamily: "inherit", background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left" }}
    >
      {name}
    </button>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: COLORS.bgS, borderRadius: 10, padding: "14px 18px", border: `0.5px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 13, color: COLORS.textT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: accent || COLORS.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: COLORS.textS, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StepCard({ question, sub, children }) {
  return (
    <div style={{ padding: "22px 26px", borderRadius: 14, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text, marginBottom: sub ? 4 : 14 }}>{question}</div>
      {sub && <div style={{ fontSize: 13, color: COLORS.textS, marginBottom: 14 }}>{sub}</div>}
      {children}
    </div>
  );
}

function OptionButton({ label, sub, selected, onClick, color, disabled }) {
  const c = color || "#5DCAA5";
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "11px 18px", borderRadius: 10, border: `1.5px solid ${selected ? c : COLORS.border}`, background: selected ? c + "18" : COLORS.bg, color: selected ? c : COLORS.text, cursor: disabled ? "not-allowed" : "pointer", fontSize: 14, fontWeight: selected ? 500 : 400, textAlign: "left", transition: "all 0.15s", minWidth: 130, opacity: disabled ? 0.5 : 1 }}>
      <div>{label}</div>
      {sub && <div style={{ fontSize: 12, color: selected ? c : COLORS.textT, marginTop: 3 }}>{sub}</div>}
    </button>
  );
}

function Trail({ steps, onBack }) {
  if (!steps.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => onBack(i)} style={{ fontSize: 13, padding: "3px 10px", borderRadius: 20, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, color: COLORS.textS, cursor: "pointer" }}>{s}</button>
          {i < steps.length - 1 && <span style={{ color: COLORS.textT, fontSize: 13 }}>›</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Group session card ────────────────────────────────────────────────────────

function GroupSessionCard({ items, sessionTypeName, maxClients, accepted, onAccept, onReject, typeColors }) {
  const [showTip, setShowTip] = useState(false);
  const color = typeColors[sessionTypeName] || "#888888";

  const staffScores = {};
  items.forEach(item => {
    (item.matches || []).forEach(m => {
      staffScores[m.staffName] = (staffScores[m.staffName] || 0) + m.score;
    });
  });
  const topStaff = Object.entries(staffScores).sort((a, b) => b[1] - a[1])[0]?.[0] || "No staff available";

  const ranked = items.map(item => {
    const mi = item.matches?.findIndex(m => m.staffName === topStaff);
    const matchIdx = mi >= 0 ? mi : 0;
    const match = item.matches?.[matchIdx];
    return { item, match, matchIdx, key: `${item.clientName}-${matchIdx}`, score: match?.score ?? 0 };
  }).sort((a, b) => b.score - a.score);

  const inCap = ranked.slice(0, maxClients);
  const overflow = ranked.slice(maxClients);
  const acceptedCount = ranked.filter(r => accepted[r.key] === true).length;

  function ClientRow({ r, isOverflow }) {
    const isA = accepted[r.key] === true, isR = accepted[r.key] === false;
    const sc = r.score >= 80 ? "#5DCAA5" : r.score >= 60 ? "#EF9F27" : "#E24B4A";
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 10, background: COLORS.bg, border: `1.5px solid ${isA ? "#5DCAA5" : isR ? "#E24B4A44" : COLORS.border}`, opacity: isR ? 0.5 : 1, transition: "all 0.2s" }}>
        {isOverflow && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#EF9F2722", color: "#EF9F27", border: "0.5px solid #EF9F2766", fontWeight: 500, flexShrink: 0 }}>Over cap</span>}
        <div style={{ minWidth: 36, height: 36, borderRadius: 8, background: sc + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: sc }}>{r.score}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{r.item.clientName}</div>
          {r.match?.overlappingSlots?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
              {r.match.overlappingSlots.map(s => <span key={s} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "#5DCAA522", color: "#0F6E56", border: "0.5px solid #9FE1CB" }}>{s}</span>)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button aria-label={`Accept ${r.item.clientName} · ${r.match?.staffName || "this match"}`} onClick={() => onAccept(r.key, r.match, r.item)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: isA ? "#5DCAA5" : "#E1F5EE", color: isA ? "#fff" : "#0F6E56" }}>✓</button>
          <button aria-label={`Reject ${r.item.clientName} · ${r.match?.staffName || "this match"}`} onClick={() => onReject(r.key)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: isR ? "#E24B4A" : "#FCEBEB", color: isR ? "#fff" : "#A32D2D" }}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: `0.5px solid ${COLORS.border}`, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: COLORS.bgS, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{sessionTypeName}</div>
          <div style={{ fontSize: 13, color: COLORS.textS, marginTop: 2 }}>{topStaff}</div>
        </div>
        <div style={{ position: "relative" }} onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
          <span style={{ fontSize: 13, padding: "3px 12px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}44`, fontWeight: 500, cursor: "default" }}>
            {acceptedCount}/{maxClients} clients
          </span>
          {showTip && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: COLORS.bg, border: `0.5px solid ${COLORS.borderS}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, color: COLORS.textS, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 10 }}>
              Need more slots? Check the session type settings.
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {inCap.map(r => <ClientRow key={r.key} r={r} isOverflow={false} />)}
        {overflow.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
              <div style={{ flex: 1, height: "0.5px", background: COLORS.border }} />
              <span style={{ fontSize: 11, color: COLORS.textT }}>Over cap · {overflow.length} client{overflow.length !== 1 ? "s" : ""}</span>
              <div style={{ flex: 1, height: "0.5px", background: COLORS.border }} />
            </div>
            {overflow.map(r => <ClientRow key={r.key} r={r} isOverflow={true} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Client match card ────────────────────────────────────────────────────────

function ClientMatchCard({ item, accepted, onAccept, onReject, typeColors }) {
  const [expanded, setExpanded] = useState(true);
  const acceptedCount = (item.matches || []).filter((_, i) => accepted[`${item.clientName}-${i}`] === true).length;
  const color = typeColors[item.sessionType] || "#888888";
  return (
    <div style={{ borderRadius: 10, border: `0.5px solid ${COLORS.border}`, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setExpanded(v => !v)} style={{ padding: "12px 16px", background: COLORS.bgS, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{item.clientName}</span>
          <Badge label={item.sessionType} color={color} />
        </div>
        {acceptedCount > 0 && <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: "#5DCAA522", color: "#0F6E56", border: "0.5px solid #9FE1CB", fontWeight: 500 }}>{acceptedCount} accepted</span>}
        <span style={{ color: COLORS.textT, fontSize: 14, marginLeft: 4 }}>{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!item.matches?.length
            ? <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", fontSize: 13, color: "#A32D2D" }}>No eligible staff found. {item.notes}</div>
            : item.matches.map((m, mi) => {
              const key = `${item.clientName}-${mi}`;
              const isA = accepted[key] === true, isR = accepted[key] === false;
              const sc = m.score >= 80 ? "#5DCAA5" : m.score >= 60 ? "#EF9F27" : "#E24B4A";
              return (
                <div key={mi} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, background: COLORS.bg, border: `1.5px solid ${isA ? "#5DCAA5" : isR ? "#E24B4A44" : COLORS.border}`, opacity: isR ? 0.5 : 1, transition: "all 0.2s" }}>
                  <div style={{ minWidth: 42, height: 42, borderRadius: 8, background: sc + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, color: sc }}>{m.score}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 3 }}>{m.staffName}</div>
                    <div style={{ fontSize: 13, color: COLORS.textS, marginBottom: 6 }}>{m.reason}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {m.overlappingSlots?.map(s => <span key={s} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "#5DCAA522", color: "#0F6E56", border: "0.5px solid #9FE1CB" }}>{s}</span>)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button aria-label={`Accept ${m.staffName}`} onClick={() => onAccept(key, m, item)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: isA ? "#5DCAA5" : "#E1F5EE", color: isA ? "#fff" : "#0F6E56" }}>✓</button>
                    <button aria-label={`Reject ${m.staffName}`} onClick={() => onReject(key)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: isR ? "#E24B4A" : "#FCEBEB", color: isR ? "#fff" : "#A32D2D" }}>✕</button>
                  </div>
                </div>
              );
            })
          }
          {item.notes && item.matches?.length > 0 && <div style={{ fontSize: 12, color: COLORS.textS, padding: "8px 12px", borderRadius: 8, background: COLORS.bgS }}>{item.notes}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ clients, employees, bookings, typeColors, onFocusPerson }) {
  const [staffFilter, setStaffFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const filteredBookings = activeBookings.filter(b => {
    const staffOk = staffFilter === "all" || b.employee_id === Number(staffFilter);
    const clientOk = clientFilter === "all" || b.client_id === Number(clientFilter);
    return staffOk && clientOk;
  });

  const utilization = employees.length
    ? Math.round(employees.reduce((a, e) => a + e.booked / e.capacity, 0) / employees.length * 100) : 0;

  const typeBreakdown = Object.entries(
    activeBookings.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Dashboard</h2>
        <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>Overview of your scheduling activity</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Total sessions" value={activeBookings.length} sub="across all calendars" accent="#378ADD" />
        <StatCard label="Active clients" value={clients.filter(c => c.status === "active").length} sub={`${clients.filter(c => c.status === "waitlist").length} waitlisted`} accent="#5DCAA5" />
        <StatCard label="Staff utilization" value={`${utilization}%`} sub="across all staff" accent="#EF9F27" />
        <StatCard label="Open slots" value={employees.reduce((a, e) => a + (e.capacity - e.booked), 0)} sub="available this week" accent="#D4537E" />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: COLORS.textS }}>Filter:</span>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 }}>
          <option value="all">All staff</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 }}>
          <option value="all">All clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(staffFilter !== "all" || clientFilter !== "all") && (
          <button onClick={() => { setStaffFilter("all"); setClientFilter("all"); }}
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
            Clear
          </button>
        )}
        <span style={{ fontSize: 13, color: COLORS.textT }}>{filteredBookings.length} sessions</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>Sessions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
            {filteredBookings.length === 0
              ? <div style={{ fontSize: 14, color: COLORS.textT, padding: "20px 0" }}>No sessions match this filter.</div>
              : filteredBookings.slice(0, 20).map(b => {
                const client = clients.find(c => c.id === b.client_id);
                const emp = employees.find(e => e.id === b.employee_id);
                const color = typeColors[b.type] || "#888888";
                const bDay = b.session_date ? dayFromDate(b.session_date) : "—";
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                    <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <Avatar name={client?.name || "?"} size={32} color={color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <PersonLink
                          name={client?.name}
                          onClick={client && (() => onFocusPerson({ clientId: client.id, dateStr: b.session_date, label: client.name }))}
                        />
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.textS }}>
                        <PersonLink
                          name={emp?.name}
                          size={13} weight={400} color={COLORS.textS}
                          onClick={emp && (() => onFocusPerson({ employeeId: emp.id, dateStr: b.session_date, label: emp.name }))}
                        /> · {bDay} {b.hour}:00
                      </div>
                    </div>
                    <Badge label={b.type} color={color} />
                  </div>
                );
              })
            }
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>Staff capacity</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {employees.map(e => {
                const pct = e.booked / e.capacity;
                const color = pct > 0.85 ? "#E24B4A" : pct > 0.6 ? "#EF9F27" : "#5DCAA5";
                return (
                  <div key={e.id} style={{ padding: "10px 14px", borderRadius: 8, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{e.name}</div>
                      <span style={{ fontSize: 13, color: COLORS.textS }}>{e.booked}/{e.capacity}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: COLORS.border }}>
                      <div style={{ height: "100%", borderRadius: 4, background: color, width: `${Math.round(pct * 100)}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {typeBreakdown.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>By session type</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {typeBreakdown.map(([type, count]) => {
                  const color = typeColors[type] || "#888888";
                  const pct = Math.round(count / activeBookings.length * 100);
                  return (
                    <div key={type} style={{ padding: "8px 14px", borderRadius: 8, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color }}>{type}</span>
                        <span style={{ fontSize: 13, color: COLORS.textS }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 3, background: COLORS.border }}>
                        <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Clients view ─────────────────────────────────────────────────────────────

function ClientsView({ clients, locations, clientAvailability, setClientAvailability, showToast, workStart, workEnd, workDays }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = clients.filter(c => JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));

  function handleSave(clientId, newRanges) {
    setClientAvailability(prev => [...prev.filter(a => a.client_id !== clientId), ...newRanges]);
    setExpandedId(null);
    showToast("Availability saved");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Clients</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>{clients.filter(c => c.status === "active").length} active · {clients.filter(c => c.status === "waitlist").length} waitlisted</p>
        </div>
        <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 200 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  {clients.length === 0 && (
    <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
      No clients yet
    </div>
  )}

  {filtered.map(client => {
          const loc = locations?.find(l => l.id === client.location_id);
          const isExp = expandedId === client.id;
          const cAvail = (clientAvailability || []).filter(a => a.client_id === client.id);
          const availSummary = AVAIL_DAYS.filter(d => cAvail.some(a => a.day === d)).map(d => {
            const slots = cAvail.filter(a => a.day === d);
            const earliest = slots.reduce((min, a) => String(a.start_time).substring(0, 5) < min ? String(a.start_time).substring(0, 5) : min, "23:59");
            const latest = slots.reduce((max, a) => String(a.end_time).substring(0, 5) > max ? String(a.end_time).substring(0, 5) : max, "00:00");
            return `${d} ${earliest}–${latest}`;
          });
          return (
            <div key={client.id} style={{ borderRadius: 10, background: COLORS.bgS, border: `0.5px solid ${isExp ? COLORS.borderS : COLORS.border}`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
                <Avatar name={client.name} color="#378ADD" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{client.name}</div>
                  <div style={{ fontSize: 13, color: COLORS.textS }}>{client.email}</div>
                  {loc && <div style={{ fontSize: 12, color: COLORS.textT }}>{loc.name}</div>}
                  {availSummary.length > 0 && <div style={{ fontSize: 12, color: COLORS.textT, marginTop: 4 }}>{availSummary.join(" · ")}</div>}
                </div>
                <Badge label={client.status === "active" ? "Active" : "Waitlist"} color={client.status === "active" ? "#5DCAA5" : "#EF9F27"} />
                <div style={{ fontSize: 13, color: COLORS.textS, minWidth: 70, textAlign: "right" }}>{client.sessions} sessions</div>
                <button onClick={() => setExpandedId(isExp ? null : client.id)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: isExp ? COLORS.bgT : COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                  {isExp ? "Close" : "Edit availability"}
                </button>
              </div>
              {isExp && <div style={{ padding: "0 16px 16px" }}>
                <AvailabilityGrid entityId={client.id} entityType="client" existingAvailability={cAvail} onSave={handleSave} onCancel={() => setExpandedId(null)} workStart={workStart} workEnd={workEnd} workDays={workDays} />
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Staff view ───────────────────────────────────────────────────────────────

function EmployeesView({ employees, locations, staffAvailability, setStaffAvailability, typeColors, showToast, workStart, workEnd, workDays }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = employees.filter(e => JSON.stringify(e).toLowerCase().includes(search.toLowerCase()));

  function handleSave(staffId, newRanges) {
    setStaffAvailability(prev => [...prev.filter(a => a.staff_id !== staffId), ...newRanges]);
    setExpandedId(null);
    showToast("Availability saved");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Staff</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>{employees.length} team members</p>
        </div>
        <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 200 }} />
      </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  {employees.length === 0 && (
    <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
      No employees yet
    </div>
  )}

  {filtered.map(emp => {
          const pct = emp.booked / emp.capacity;
          const barColor = pct > 0.85 ? "#E24B4A" : pct > 0.6 ? "#EF9F27" : "#5DCAA5";
          const loc = locations?.find(l => l.id === emp.location_id);
          const empAvail = (staffAvailability || []).filter(a => a.staff_id === emp.id);
          const isExp = expandedId === emp.id;
          const availSummary = AVAIL_DAYS.filter(d => empAvail.some(a => a.day === d)).map(d => {
            const slots = empAvail.filter(a => a.day === d);
            const earliest = slots.reduce((min, a) => String(a.start_time).substring(0, 5) < min ? String(a.start_time).substring(0, 5) : min, "23:59");
            const latest = slots.reduce((max, a) => String(a.end_time).substring(0, 5) > max ? String(a.end_time).substring(0, 5) : max, "00:00");
            return `${d} ${earliest}–${latest}`;
          });
          return (
            <div key={emp.id} style={{ borderRadius: 10, background: COLORS.bgS, border: `0.5px solid ${isExp ? COLORS.borderS : COLORS.border}`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
                <Avatar name={emp.name} color="#378ADD" size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: COLORS.textS }}>{emp.role}</div>
                  {loc && <div style={{ fontSize: 12, color: COLORS.textT }}>{loc.name}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {emp.specialties?.map(s => <Badge key={s} label={s} color={typeColors[s] || "#888888"} />)}
                  </div>
                  {availSummary.length > 0 && <div style={{ fontSize: 12, color: COLORS.textT, marginTop: 5 }}>{availSummary.join(" · ")}</div>}
                </div>
                <div style={{ minWidth: 180 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textS, marginBottom: 5 }}>
                    <span>Capacity</span><span>{emp.booked}/{emp.capacity}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 4, background: COLORS.border }}>
                    <div style={{ height: "100%", borderRadius: 4, background: barColor, width: `${Math.round(pct * 100)}%` }} />
                  </div>
                </div>
                <button onClick={() => setExpandedId(isExp ? null : emp.id)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: isExp ? COLORS.bgT : COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                  {isExp ? "Close" : "Edit availability"}
                </button>
              </div>
              {isExp && <div style={{ padding: "0 16px 16px" }}>
                <AvailabilityGrid entityId={emp.id} entityType="staff" existingAvailability={empAvail} onSave={handleSave} onCancel={() => setExpandedId(null)} workStart={workStart} workEnd={workEnd} workDays={workDays} />
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session types view ───────────────────────────────────────────────────────

function SessionTypesView({ sessionTypes, setSessionTypes, showToast }) {
  const appUser = useContext(UserContext);
  const [editingType, setEditingType] = useState(null);

  function handleSave(updated, wasNew) {
    setSessionTypes(prev => wasNew ? [...prev, updated] : prev.map(st => st.id === updated.id ? { ...st, ...updated } : st));
    setEditingType(null);
    showToast(wasNew ? "Session type added" : "Session type saved");
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Session types</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>Configure session formats, pricing, and scheduling rules</p>
        </div>
        <button onClick={() => setEditingType({})}
          style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", background: "#5DCAA5", color: "#fff", cursor: "pointer" }}>
          + New session type
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {sessionTypes.map(st => (
          <div key={st.id} style={{ padding: "18px 20px", borderRadius: 12, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, borderTop: `3px solid ${st.color}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 500, color: COLORS.text }}>{st.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {st.max_clients > 1 && (
                  <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: st.color + "22", color: st.color, border: `1px solid ${st.color}44` }}>
                    Max {st.max_clients} clients
                  </span>
                )}
                {st.is_client_optional && (
                  <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: COLORS.bgT, color: COLORS.textS, border: `1px solid ${COLORS.border}` }}>
                    No client
                  </span>
                )}
                <button onClick={() => setEditingType(st)}
                  style={{ padding: "4px 12px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                  Edit
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textT, marginBottom: 2 }}>DURATION</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: st.color }}>
                  {st.duration_minutes ?? st.duration}<span style={{ fontSize: 13, color: COLORS.textS }}> min</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textT, marginBottom: 2 }}>COST</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: st.color }}>
                  ${st.cost ?? st.price ?? "—"}
                </div>
              </div>
              {(st.gap_before_minutes > 0 || st.gap_after_minutes > 0) && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textT, marginBottom: 2 }}>GAP</div>
                  <div style={{ fontSize: 13, color: COLORS.textS, marginTop: 4 }}>
                    {st.gap_before_minutes || 0}m before · {st.gap_after_minutes || 0}m after
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {editingType && (
        <SessionTypeEditModal
          sessionType={editingType}
          clinicId={appUser?.clinic_id}
          onSave={handleSave}
          onClose={() => setEditingType(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─── Settings view ────────────────────────────────────────────────────────────

function SettingsView({ employees, clients, locations, typeColors, workDays, setWorkDays, workStart, setWorkStart, workEnd, setWorkEnd, showToast }) {
  const [tab, setTab] = useState("general");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [language, setLanguage] = useState("English");
  const [darkMode, setDarkMode] = useState(false);
  const [density, setDensity] = useState("comfortable");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");

  const TABS = ["General", "User Management", "Admin"];
  const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const TIMEZONES = ["America/Toronto", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris"];
  const LANGUAGES = ["Bulgarian", "English", "French", "Italian", "Spanish"];

  const allUsers = [
    ...employees.map(e => ({ ...e, kind: "staff" })),
    ...clients.map(c => ({ ...c, kind: "client" })),
  ].filter(u => {
    const q = userSearch.toLowerCase();
    const matches = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    if (userFilter === "all") return matches;
    return matches && u.kind === userFilter;
  });

  function Toggle({ value, onChange }) {
    return (
      <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? "#5DCAA5" : COLORS.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
    );
  }

  function SettingRow({ label, sub, children }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `0.5px solid ${COLORS.border}` }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: COLORS.textT, marginTop: 2 }}>{sub}</div>}
        </div>
        {children}
      </div>
    );
  }

  function Select({ value, onChange, options }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13, cursor: "pointer" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Settings</h2>
        <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>Manage your workspace preferences</p>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 28, borderBottom: `0.5px solid ${COLORS.border}` }}>
        {TABS.map(t => {
          const isActive = tab === t.toLowerCase().replace(" ", "");
          return (
            <button key={t} onClick={() => setTab(t.toLowerCase().replace(" ", ""))}
              style={{ padding: "8px 20px", fontSize: 14, fontWeight: isActive ? 500 : 400, border: "none", background: "none", color: isActive ? COLORS.text : COLORS.textT, cursor: "pointer", borderBottom: `2px solid ${isActive ? "#5DCAA5" : "transparent"}`, marginBottom: -1, transition: "all 0.15s" }}>
              {t}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>REGIONAL</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "0 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <SettingRow label="Timezone" sub="Used for session scheduling and display">
              <Select value={timezone} onChange={setTimezone} options={TIMEZONES} />
            </SettingRow>
            <SettingRow label="Language" sub="Interface display language">
              <Select value={language} onChange={setLanguage} options={LANGUAGES} />
            </SettingRow>
            <SettingRow label="Date format" sub="How dates appear across the app">
              <Select value={dateFormat} onChange={setDateFormat} options={["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]} />
            </SettingRow>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>APPEARANCE</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "0 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <SettingRow label="Dark mode" sub="Toggle dark or light interface">
              <Toggle value={darkMode} onChange={setDarkMode} />
            </SettingRow>
            <SettingRow label="Display density" sub="Controls spacing and card size">
              <div style={{ display: "flex", gap: 6 }}>
                {["compact", "comfortable", "spacious"].map(d => (
                  <button key={d} onClick={() => setDensity(d)}
                    style={{ padding: "4px 12px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${density === d ? "#5DCAA5" : COLORS.border}`, background: density === d ? "#5DCAA518" : COLORS.bg, color: density === d ? "#5DCAA5" : COLORS.textS, cursor: "pointer", fontWeight: density === d ? 500 : 400 }}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>CALENDAR VIEW RANGE</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "18px 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 10 }}>Work days</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ALL_DAYS.map(d => {
                  const on = workDays.includes(d);
                  return (
                    <button key={d} onClick={() => { setWorkDays(prev => { const next = on ? prev.filter(x => x !== d) : [...prev, d]; showToast("Work days updated"); return next; }); }}
                      style={{ width: 44, height: 36, borderRadius: 8, fontSize: 13, fontWeight: on ? 500 : 400, border: `1px solid ${on ? "#5DCAA5" : COLORS.border}`, background: on ? "#5DCAA518" : COLORS.bg, color: on ? "#5DCAA5" : COLORS.textS, cursor: "pointer", transition: "all 0.15s" }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>Start time</div>
                <div style={{ fontSize: 13, color: COLORS.textS }}>{workStart}:00</div>
              </div>
              <input type="range" min={6} max={12} value={workStart} onChange={e => { setWorkStart(Number(e.target.value)); showToast("Start time updated"); }}
                style={{ width: "100%", accentColor: "#5DCAA5" }} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>End time</div>
                <div style={{ fontSize: 13, color: COLORS.textS }}>{workEnd}:00</div>
              </div>
              <input type="range" min={14} max={21} value={workEnd} onChange={e => { setWorkEnd(Number(e.target.value)); showToast("End time updated"); }}
                style={{ width: "100%", accentColor: "#5DCAA5" }} />
            </div>
          </div>
        </div>
      )}

      {tab === "usermanagement" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
            <input placeholder="Search users…" value={userSearch} onChange={e => setUserSearch(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 220 }} />
            <div style={{ display: "flex", gap: 4 }}>
              {["all", "staff", "client"].map(f => (
                <button key={f} onClick={() => setUserFilter(f)}
                  style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, border: `0.5px solid ${userFilter === f ? "#5DCAA5" : COLORS.border}`, background: userFilter === f ? "#5DCAA518" : COLORS.bg, color: userFilter === f ? "#5DCAA5" : COLORS.textS, cursor: "pointer", fontWeight: userFilter === f ? 500 : 400 }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", fontSize: 13, color: COLORS.textT }}>{allUsers.length} users</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {allUsers.map(u => {
              const isStaff = u.kind === "staff";
              const loc = locations?.find(l => l.id === u.location_id);
              const color = isStaff ? "#378ADD" : "#5DCAA5";
              return (
                <div key={`${u.kind}-${u.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                  <Avatar name={u.name} color={color} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    {loc && <div style={{ fontSize: 11, color: COLORS.textT }}>{loc.name}</div>}
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: color + "18", color, border: `0.5px solid ${color}44`, flexShrink: 0 }}>
                    {isStaff ? (u.role || "Staff") : "Client"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "admin" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>CLINIC</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "0 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <SettingRow label="Clinic name" sub="Displayed across reports and exports">
              <input defaultValue="Summit ABA Clinic" style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, width: 200 }} />
            </SettingRow>
            <SettingRow label="Billing cycle" sub="How often invoices are generated">
              <Select value="Monthly" onChange={() => {}} options={["Weekly", "Bi-weekly", "Monthly"]} />
            </SettingRow>
            <SettingRow label="Session overlap buffer" sub="Minimum gap between sessions (minutes)">
              <Select value="15 min" onChange={() => {}} options={["0 min", "10 min", "15 min", "30 min"]} />
            </SettingRow>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>ACCESS & SECURITY</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "0 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <SettingRow label="Require 2FA" sub="Enforce two-factor authentication for all users">
              <Toggle value={false} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="Session timeout" sub="Auto-logout after inactivity">
              <Select value="30 min" onChange={() => {}} options={["15 min", "30 min", "1 hour", "4 hours"]} />
            </SettingRow>
            <SettingRow label="Audit logging" sub="Track all scheduling actions">
              <Toggle value={true} onChange={() => {}} />
            </SettingRow>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>DATA</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "0 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <SettingRow label="Export all sessions" sub="Download a CSV of all booked sessions">
              <button style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>Export CSV</button>
            </SettingRow>
            <SettingRow label="Data retention" sub="How long session records are kept">
              <Select value="3 years" onChange={() => {}} options={["1 year", "2 years", "3 years", "Indefinite"]} />
            </SettingRow>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create view ──────────────────────────────────────────────────────────────

function CreateView({ clients, employees, sessionTypes, locations, calendars, setCalendars, staffAvailability, clientAvailability, bookings, refreshBookings, typeColors, showToast, workDays, workStart, workEnd, prefill, onConsumedPrefill }) {
  const appUser = useContext(UserContext);
  const [step, setStep] = useState("calendar");
  const [trail, setTrail] = useState([]);

  const [editingCalId, setEditingCalId] = useState(null);
  const [editingCalName, setEditingCalName] = useState("");
  const [hoveredCalId, setHoveredCalId] = useState(null);
  // The Confirm/rename/archive buttons below were only ever revealed on
  // mouse hover - a keyboard-only user tabbing to a calendar pill had no way
  // to make them appear at all, so they were unreachable by keyboard.
  const [focusedCalId, setFocusedCalId] = useState(null);

  const [selectedCalendar, setSelectedCalendar] = useState(null);
  const [showNewCal, setShowNewCal] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [calCreating, setCalCreating] = useState(false);
  const [createAsDraft, setCreateAsDraft] = useState(false);

  const [matchCount, setMatchCount] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedSessionType, setSelectedSessionType] = useState(null);
  const [staffChoice, setStaffChoice] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [sessionsPerWeek, setSessionsPerWeek] = useState(null);
  const [recurring, setRecurring] = useState(null);
  const [endType, setEndType] = useState(null);
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState("");

  const [activeTab, setActiveTab] = useState("");
  const [multiClients, setMultiClients] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [reviewItems, setReviewItems] = useState([]);
  const [accepted, setAccepted] = useState({});
  const [proposedSessions, setProposedSessions] = useState([]);
  const [booking, setBooking] = useState(false);

  // Click-to-create on the real calendar hands us an exact date/hour/minute
  // (not a day-of-week template like the rest of this wizard), so it gets
  // its own step rather than forcing that click through AI-driven
  // availability matching. Auto-selects whichever calendar term covers the
  // clicked date and jumps straight there.
  const [quickClient, setQuickClient] = useState(null);
  const [quickType, setQuickType] = useState(null);
  const [quickStaff, setQuickStaff] = useState(null);
  // Location defaults to wherever the clinician and client both are
  // (eligibleStaff below already only offers clinicians at the client's own
  // location), with a distinct home-visit case - the same location model
  // migration 0018 built for the Create flow generally, previously only
  // ever wired up in the quick-create modal this step replaced.
  const [quickIsHome, setQuickIsHome] = useState(false);
  const [quickHomeAddress, setQuickHomeAddress] = useState("");
  // Conflict-resolution suggestions (never a hard block): set only for the
  // single, non-recurring booking - a recurring series is handled by the
  // existing per-date auto-skip below, since prompting once per occurrence
  // in a dozens-long series isn't practical.
  const [pendingConflict, setPendingConflict] = useState(null);
  useEffect(() => {
    if (!pendingConflict) return;
    const onKey = e => { if (e.key === "Escape") setPendingConflict(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingConflict]);
  const pendingConflictTrapRef = useFocusTrap(!!pendingConflict);
  useEffect(() => {
    if (!prefill) return;
    // Prefer an active calendar over a draft one - a draft's sessions are
    // deliberately hidden from the live calendar view until confirmed, and
    // silently booking a click-to-create session into one would make it
    // vanish from the exact view the scheduler just clicked on.
    const covering = calendars.find(c => c.status === "active" && c.date_start <= prefill.dateStr && prefill.dateStr <= c.date_end)
      ?? calendars.find(c => c.status !== "archived" && c.date_start <= prefill.dateStr && prefill.dateStr <= c.date_end);
    setSelectedCalendar(covering || null);
    setQuickClient(null); setQuickType(null); setQuickStaff(null);
    setQuickIsHome(false); setQuickHomeAddress("");
    setRecurring(null); setEndType(null); setEndDate(""); setEndCount("");
    setPendingConflict(null);
    setTrail([]);
    setStep("quickSlot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const ONE_ORDER = ["calendar", "matchCount", "location", "client", "sessionType", "staff", "time", "review", "booked"];
  const MULTI_ORDER = ["calendar", "matchCount", "multiClient", "time", "review", "booked"];

  function getNextQuarterPlaceholder() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const quarter = Math.floor(month / 3) + 1;
    const nextQ = quarter === 4 ? 1 : quarter + 1;
    const nextYear = quarter === 4 ? year + 1 : year;
    return `${nextYear}, or Q${nextQ} ${nextYear}`;
  }

  function advance(nextStep, label) { setTrail(t => [...t, label]); setStep(nextStep); }
  function goBack(idx) {
    const order = matchCount === "multiple" ? MULTI_ORDER : ONE_ORDER;
    setTrail(t => t.slice(0, idx));
    setStep(order[idx] || "calendar");
    setError(null);
  }

  // Used to default to "draft" unconditionally - every calendar anyone ever
  // created stayed invisible on the live Calendar tab (see CalendarView's
  // draftCalendarIds) until someone found the Confirm button below, which
  // nothing on the Calendar tab pointed to. Draft still exists as a real,
  // opt-in choice (see the checkbox in the "calendar" step below) for a
  // scheduler who genuinely wants to stage a batch before it goes live -
  // it's just no longer what you get by not noticing there was a choice.
  async function createCalendar(asDraft = false) {
    if (!newCalName) return;
    setCalCreating(true);
    // toDateStr(new Date()) (local Y/M/D), not new Date().toISOString() -
    // the latter converts "now" to UTC before extracting the date, which is
    // already the next calendar day in any timezone behind UTC for several
    // hours every evening (e.g. Eastern time from ~8pm-midnight). A calendar
    // created that evening would silently get a date_start of tomorrow,
    // excluding today from its term. See dateUtils.ts's file header.
    const today = todayDateStr();
    const farFuture = `${new Date().getFullYear() + 3}-12-31`;
    const { data } = await supabase
      .from("calendars")
      .insert({ name: newCalName, date_start: today, date_end: farFuture, status: asDraft ? "draft" : "active", clinic_id: appUser.clinic_id })
      .select().single();
    if (data) {
      setCalendars(prev => [...prev, data]);
      setSelectedCalendar(data);
      setShowNewCal(false);
      showToast(asDraft ? "Draft calendar created — confirm it from the Calendar tab when you're ready to go live" : "Calendar created");
      setNewCalName("");
      setCreateAsDraft(false);
    }
    setCalCreating(false);
  }

  async function renameCalendar(id) {
    if (!editingCalName.trim()) return;
    const { data } = await supabase.from("calendars").update({ name: editingCalName.trim() }).eq("id", id).select().single();
    if (data) setCalendars(prev => prev.map(c => c.id === id ? { ...c, name: data.name } : c));
    setEditingCalId(null);
    showToast("Calendar renamed");
  }

  async function archiveCalendar(id) {
    await supabase.from("calendars").update({ status: "archived" }).eq("id", id);
    setCalendars(prev => prev.filter(c => c.id !== id));
    if (selectedCalendar?.id === id) setSelectedCalendar(null);
  }

  // A draft calendar's sessions are deliberately kept off the live calendar
  // view and out of conflict/gap checks (see CalendarView's draftCalendarIds)
  // so a scheduler can build out a batch without it going live session by
  // session. Confirming is a single status flip - every session already
  // booked under this calendar becomes visible the moment this resolves,
  // with nothing to migrate since they were never anywhere else.
  async function confirmCalendar(id) {
    const { data } = await supabase.from("calendars").update({ status: "active" }).eq("id", id).select().single();
    if (data) {
      setCalendars(prev => prev.map(c => c.id === id ? data : c));
      if (selectedCalendar?.id === id) setSelectedCalendar(data);
      showToast(`${data.name} confirmed — now live on the calendar`);
    }
  }

  function buildReviewItems(res, type, client, sessionType) {
    if (type === "single" || type === "one") {
      return [{
        clientId: client?.id,
        clientName: client?.name,
        sessionType: sessionType?.name,
        locationId: client?.location_id,
        matches: (res?.matches || []).map((m, i) => ({ ...m, key: `single-${i}` })),
        notes: res?.notes,
        recommendation: res?.recommendation,
      }];
    }
    return (res?.clientMatches || []).map((cm, ci) => {
      const c = clients.find(cl => cl.name === cm.clientName);
      return {
        clientId: c?.id,
        clientName: cm.clientName,
        sessionType: cm.sessionType,
        locationId: c?.location_id,
        matches: (cm.matches || []).map((m, mi) => ({ ...m, key: `multi-${ci}-${mi}` })),
        notes: cm.notes,
      };
    });
  }

  function handleAccept(key, match, item) {
    const isCurrentlyAccepted = accepted[key] === true;
    if (isCurrentlyAccepted) {
      setAccepted(a => ({ ...a, [key]: undefined }));
      setProposedSessions(prev => prev.filter(p => p.key !== key));
    } else {
      const staff = employees.find(e => e.name === match.staffName);
      const { day, hour, minute } = parseSlot(match.overlappingSlots?.[0]);
      setAccepted(a => ({ ...a, [key]: true }));
      setProposedSessions(prev => {
        const f = prev.filter(p => p.key !== key);
        return [...f, { key, clientId: item.clientId, clientName: item.clientName, staffId: staff?.id, staffName: match.staffName, sessionType: item.sessionType, locationId: item.locationId, day, hour, minute, color: typeColors[item.sessionType] || "#888888" }];
      });
    }
  }

  function handleReject(key) {
    const isCurrentlyRejected = accepted[key] === false;
    setAccepted(a => ({ ...a, [key]: isCurrentlyRejected ? undefined : false }));
    if (!isCurrentlyRejected) setProposedSessions(prev => prev.filter(p => p.key !== key));
  }

  async function handleConfirmAndBook() {
    setBooking(true);
    setError(null);
    try {
      const inserts = [];
      const skipped = [];

      for (const ps of proposedSessions) {
        if (!ps.staffId || !ps.clientId) continue;
        const recurrenceId = recurring === "yes" ? crypto.randomUUID() : null;
        const dates = recurring === "yes"
          ? generateRecurringDates(selectedCalendar.date_start, selectedCalendar.date_end, ps.day, endType, endDate, endCount)
          : generateRecurringDates(selectedCalendar.date_start, selectedCalendar.date_end, ps.day, "count", null, 1);

        dates.forEach(date => {
          const conflict = bookings.some(b =>
            b.employee_id === ps.staffId &&
            b.session_date === date &&
            b.hour === ps.hour &&
            b.status !== "cancelled"
          );
          if (conflict) {
            skipped.push(`${ps.clientName} · ${date} ${ps.hour}:${String(ps.minute).padStart(2, "0")}`);
          } else {
            inserts.push({
              recurrence_id: recurrenceId,
              client_id: ps.clientId,
              employee_id: ps.staffId,
              hour: ps.hour,
              minute: ps.minute,
              session_date: date,
              type: ps.sessionType,
              calendar_id: selectedCalendar.id,
              status: "scheduled",
              clinic_id: appUser.clinic_id,
            });
          }
        });
      }

      if (inserts.length === 0) {
        setError(`Nothing to book — ${skipped.length} conflict${skipped.length !== 1 ? "s" : ""} with existing sessions.`);
        setBooking(false);
        return;
      }

      // Re-check the whole batch against the database right before writing -
      // `bookings` state above can be stale for as long as this wizard has
      // been open. See lib/checkSlotConflict.ts.
      const freshKeys = await fetchFreshConflictKeys(
        inserts.map(i => ({ employeeId: i.employee_id, dateStr: i.session_date, hour: i.hour, minute: i.minute })),
      );
      const freshInserts = inserts.filter(i => !freshKeys.has(slotKeyOf({ employeeId: i.employee_id, dateStr: i.session_date, hour: i.hour, minute: i.minute })));
      const freshlySkipped = inserts.length - freshInserts.length;
      if (freshInserts.length === 0) {
        setError("Nothing to book — every proposed slot was just booked by someone else.");
        setBooking(false);
        return;
      }

      const { error: err } = await supabase.from("sessions").insert(freshInserts);
      if (err) { setBooking(false); setError("Booking failed. Try again."); return; }

      // Auto-promote waitlist clients booked for Assessment
      const assessmentClientIds = [...new Set(
        proposedSessions.filter(ps => ps.sessionType === "Assessment").map(ps => ps.clientId)
      )];
      let promoted = 0;
      if (assessmentClientIds.length) {
        const { count } = await supabase
          .from("clients")
          .update({ status: "active" })
          .in("id", assessmentClientIds)
          .eq("status", "waitlist")
          .select("id", { count: "exact", head: true });
        promoted = count || 0;
        if (promoted > 0) setClients(prev => prev.map(c => assessmentClientIds.includes(c.id) ? { ...c, status: "active" } : c));
      }

      setBooking(false);
      refreshBookings();
      const totalSkipped = skipped.length + freshlySkipped;
      const baseMsg = totalSkipped ? `${freshInserts.length} booked · ${totalSkipped} skipped (conflicts)` : "Sessions booked";
      showToast(promoted > 0 ? `${baseMsg} · ${promoted} client${promoted !== 1 ? "s" : ""} promoted to active` : baseMsg);
      advance("booked", "Booked");
   } catch {
  showToast("Booking failed. Error code: BOOKING_FAILED");
  setError("Booking failed. Please try again.");
} finally {
  setBooking(false);
}
}

  // The actual insert, factored out so both the no-conflict path and the
  // conflict-resolution modal's "Book anyway" / suggestion buttons can call
  // it with an overridden date/hour/minute/staff without duplicating the
  // insert shape.
  async function insertQuickSlot({ dateStr, hour, minute, staff }) {
    setBooking(true);
    setError(null);
    try {
      // Re-check against the database right before writing - every path
      // that reaches here (no-conflict quick-book, "book anyway", accepting
      // a conflict-resolution suggestion) only checked `bookings` state,
      // which can be stale for as long as this wizard has been open. See
      // lib/checkSlotConflict.ts for why this is a real, if partial, fix.
      const fresh = await fetchFreshConflict({ employeeId: staff.id, dateStr, hour, minute });
      if (fresh) {
        setBooking(false);
        setError("That slot was just booked by someone else - pick another time.");
        return;
      }
      const { error: err } = await supabase.from("sessions").insert({
        recurrence_id: null,
        client_id: quickClient.id,
        employee_id: staff.id,
        hour, minute,
        session_date: dateStr,
        type: quickType.name,
        calendar_id: selectedCalendar.id,
        status: "scheduled",
        clinic_id: appUser.clinic_id,
        location_id: quickIsHome ? null : (staff.location_id ?? null),
        is_home_visit: quickIsHome,
        home_address: quickIsHome ? (quickHomeAddress || null) : null,
      });
      if (err) { setBooking(false); setError("Booking failed. Try again."); return; }
      setBooking(false);
      setPendingConflict(null);
      refreshBookings();
      showToast("Session booked");
      onConsumedPrefill?.();
      advance("booked", "Booked");
    } catch {
      setBooking(false);
      showToast("Booking failed. Error code: BOOKING_FAILED");
      setError("Booking failed. Please try again.");
    }
  }

  // The click-to-create quick-slot path: a firm client/staff/time decision
  // already made by clicking the real calendar, so this skips AI matching
  // and proposedSessions entirely and inserts directly - anchored on the
  // clicked date itself via generateDatesFrom, not the calendar term's own
  // start date the way every other booking path in this wizard is.
  async function bookQuickSlot() {
    if (!selectedCalendar || !quickClient || !quickStaff || !quickType || !prefill) return;

    if (recurring === "yes") {
      setBooking(true);
      setError(null);
      try {
        const recurrenceId = crypto.randomUUID();
        const dates = generateDatesFrom(prefill.dateStr, endType, endDate, endCount);
        const inserts = [];
        const skipped = [];
        dates.forEach(date => {
          const conflict = bookings.some(b =>
            b.employee_id === quickStaff.id && b.session_date === date && b.hour === prefill.hour && b.minute === prefill.minute && b.status !== "cancelled"
          );
          if (conflict) {
            skipped.push(date);
          } else {
            inserts.push({
              recurrence_id: recurrenceId, client_id: quickClient.id, employee_id: quickStaff.id,
              hour: prefill.hour, minute: prefill.minute, session_date: date, type: quickType.name,
              calendar_id: selectedCalendar.id, status: "scheduled", clinic_id: appUser.clinic_id,
              location_id: quickIsHome ? null : (quickStaff.location_id ?? null),
              is_home_visit: quickIsHome,
              home_address: quickIsHome ? (quickHomeAddress || null) : null,
            });
          }
        });

        if (inserts.length === 0) {
          setError(`Nothing to book — conflicts with existing sessions on all ${skipped.length} date(s).`);
          setBooking(false);
          return;
        }

        // Gap warning (never a hard block): same clinician or same client
        // only. One confirm covers the whole batch rather than one per
        // date - a recurring series can be dozens of dates and can't
        // practically prompt per occurrence the way the single-date path
        // below does with real suggestions.
        const gapBefore = quickType.gap_before_minutes ?? 0;
        const gapAfter = quickType.gap_after_minutes ?? 0;
        if (gapBefore || gapAfter) {
          const candDuration = quickType.duration_minutes ?? quickType.duration ?? 60;
          const insertDates = new Set(inserts.map(i => i.session_date));
          const hit = bookings.find(b => {
            if (!insertDates.has(b.session_date) || b.status === "cancelled") return false;
            if (b.employee_id !== quickStaff.id && b.client_id !== quickClient.id) return false;
            const bType = sessionTypes.find(t => t.name === b.type);
            return gapsOverlap(
              { sessionDate: b.session_date, employeeId: quickStaff.id, clientId: quickClient.id, startMinutes: prefill.hour * 60 + prefill.minute, durationMinutes: candDuration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
              { sessionDate: b.session_date, employeeId: b.employee_id, clientId: b.client_id, startMinutes: b.hour * 60 + b.minute, durationMinutes: bType?.duration_minutes ?? bType?.duration ?? 60, gapBeforeMinutes: bType?.gap_before_minutes ?? 0, gapAfterMinutes: bType?.gap_after_minutes ?? 0 },
            );
          });
          if (hit && !confirm(`This lands inside the buffer time around an existing ${hit.type} session on ${hit.session_date}. Book anyway?`)) {
            setBooking(false);
            return;
          }
        }

        // Re-check the whole batch against the database right before writing
        // - `bookings` state above can be stale. See lib/checkSlotConflict.ts.
        const freshKeys = await fetchFreshConflictKeys(
          inserts.map(i => ({ employeeId: i.employee_id, dateStr: i.session_date, hour: i.hour, minute: i.minute })),
        );
        const freshInserts = inserts.filter(i => !freshKeys.has(slotKeyOf({ employeeId: i.employee_id, dateStr: i.session_date, hour: i.hour, minute: i.minute })));
        const freshlySkipped = inserts.length - freshInserts.length;
        if (freshInserts.length === 0) {
          setError("Nothing to book — every proposed date was just booked by someone else.");
          setBooking(false);
          return;
        }

        const { error: err } = await supabase.from("sessions").insert(freshInserts);
        if (err) { setBooking(false); setError("Booking failed. Try again."); return; }

        setBooking(false);
        refreshBookings();
        const totalSkipped = skipped.length + freshlySkipped;
        showToast(totalSkipped ? `${freshInserts.length} booked · ${totalSkipped} skipped (conflicts)` : "Sessions booked");
        onConsumedPrefill?.();
        advance("booked", "Booked");
      } catch {
        setBooking(false);
        showToast("Booking failed. Error code: BOOKING_FAILED");
        setError("Booking failed. Please try again.");
      }
      return;
    }

    // Single, non-recurring booking: offer real conflict-resolution
    // suggestions instead of a plain skip/confirm, since there's exactly
    // one occurrence to resolve.
    const duration = quickType.duration_minutes ?? quickType.duration ?? 60;
    const exactConflict = bookings.find(b =>
      b.employee_id === quickStaff.id && b.session_date === prefill.dateStr && b.hour === prefill.hour && b.minute === prefill.minute && b.status !== "cancelled"
    );
    const gapBefore = quickType.gap_before_minutes ?? 0;
    const gapAfter = quickType.gap_after_minutes ?? 0;
    const gapHit = !exactConflict && (gapBefore || gapAfter) ? bookings.find(b => {
      if (b.status === "cancelled" || b.session_date !== prefill.dateStr) return false;
      if (b.employee_id !== quickStaff.id && b.client_id !== quickClient.id) return false;
      const bType = sessionTypes.find(t => t.name === b.type);
      return gapsOverlap(
        { sessionDate: prefill.dateStr, employeeId: quickStaff.id, clientId: quickClient.id, startMinutes: prefill.hour * 60 + prefill.minute, durationMinutes: duration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
        { sessionDate: b.session_date, employeeId: b.employee_id, clientId: b.client_id, startMinutes: b.hour * 60 + b.minute, durationMinutes: bType?.duration_minutes ?? bType?.duration ?? 60, gapBeforeMinutes: bType?.gap_before_minutes ?? 0, gapAfterMinutes: bType?.gap_after_minutes ?? 0 },
      );
    }) : null;

    const other = exactConflict || gapHit;
    if (!other) {
      await insertQuickSlot({ dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute, staff: quickStaff });
      return;
    }

    const otherClient = clients.find(c => c.id === other.client_id);
    const message = exactConflict
      ? `${quickStaff.name} already has a session with ${otherClient?.name || "another client"} at that time.`
      : `This lands inside the buffer time around ${otherClient?.name || "another session"}'s ${other.type}.`;
    const existing = bookings.filter(b => b.status !== "cancelled").map(b => {
      const t = sessionTypes.find(st => st.name === b.type);
      return { id: b.id, employee_id: b.employee_id, session_date: b.session_date, hour: b.hour, minute: b.minute, durationMinutes: t?.duration_minutes ?? t?.duration ?? 60, status: b.status };
    });
    const incrementMinutes = quickType.grid_increment_minutes ?? (Number(getSetting("calendar.gridIncrementMinutes")) || 15);
    const sameClinician = suggestSameClinicianOtherTime({
      employeeId: quickStaff.id, employeeName: quickStaff.name, dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute,
      durationMinutes: duration, sessions: existing, staffAvailability,
      workStartHour: parseTimeSetting(String(getSetting("calendar.workStart"))), workEndHour: parseTimeSetting(String(getSetting("calendar.workEnd"))),
      incrementMinutes,
    });
    const differentClinician = suggestDifferentClinicianSameSlot({
      dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute, durationMinutes: duration,
      locationId: quickStaff.location_id ?? null, excludeEmployeeId: quickStaff.id,
      employees: employees.filter(e => e.specialties?.includes(quickType.name)), sessions: existing, staffAvailability,
    });
    setPendingConflict({ message, suggestions: [...sameClinician, ...differentClinician] });
  }

  async function runMatch(type) {
    setLoading(true); setError(null);
    let prompt, maxTokens;

    if (type === "single" || type === "one") {
      const eligible = employees.filter(e =>
        e.specialties?.includes(selectedSessionType.name) &&
        e.booked < e.capacity &&
        e.location_id === selectedClient.location_id &&
        (staffChoice === "any" || e.id === selectedStaff?.id)
      );
      const endCond = recurring === "yes" ? (endType === "date" ? `until ${endDate}` : `${endCount} sessions total`) : "one-time";
      prompt = `You are an ABA scheduling assistant. Find the best staff match for a client.
CALENDAR: ${selectedCalendar.name} (${selectedCalendar.date_start} to ${selectedCalendar.date_end})
CLIENT: ${selectedClient.name} | SESSION: ${selectedSessionType.name} (${selectedSessionType.duration}min)
SESSIONS/WEEK: ${sessionsPerWeek} | SCHEDULE: ${recurring === "yes" ? `Recurring — ${endCond}` : "One-time"}
ELIGIBLE STAFF: ${eligible.map(e => `${e.name} (${e.booked}/${e.capacity})`).join(", ") || "none"}
Respond ONLY with valid JSON — no extra text:
{"matches":[{"staffName":"...","overlappingSlots":["Mon 9:00"]}],"recommendation":"..."}`;
      maxTokens = 800;
    } else {
      // Previously scanned the hardcoded module-level AVAIL_DAYS/TIME_SLOTS
      // (Mon-Sat, 7am-8pm) regardless of this clinic's configured
      // calendar.workDays/workStart/workEnd - same gap as PreviewGrid and
      // AvailabilityGrid, fixed the same way.
      const matchDays = AVAIL_DAYS.filter(d => workDays.includes(d));
      const matchTimeSlots = generateTimeSlots(workStart, workEnd);
      const clientMatches = multiClients.map(({ client, session_type }) => {
        const eligible = employees
          .filter(e =>
            e.specialties?.includes(session_type) &&
            e.booked < e.capacity &&
            e.location_id === client.location_id
          )
          .sort((a, b) => (a.booked / a.capacity) - (b.booked / b.capacity));

        const matches = eligible.slice(0, 3).map(emp => {
          const overlappingSlots = [];
          for (const day of matchDays) {
            for (const t of matchTimeSlots) {
              if (
                staffAvailAt(emp.id, day, t, staffAvailability) &&
                clientAvailAt(client.id, day, t, clientAvailability)
              ) {
                overlappingSlots.push(`${day} ${t}`);
                break;
              }
            }
          }
          return { staffName: emp.name, overlappingSlots };
        });

        return { clientName: client.name, sessionType: session_type, matches };
      });

      const items = buildReviewItems({ clientMatches }, "multi", null, null);
      setReviewItems(items);
      setAccepted({});
      setProposedSessions([]);
      setTrail(t => [...t, "Review"]);
      setStep("review");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      if (res.status === 401 && data?.code === "SESSION_STALE") {
        // Same race /api/match's handler guards against server-side: this
        // browser's session is due to refresh. Send it through the one place
        // allowed to redeem a refresh token instead of surfacing a confusing
        // "AI match failed" for what is really a stale-session redirect.
        const refresh = new URL(refreshUrl());
        refresh.searchParams.set("return_to", window.location.href);
        window.location.href = refresh.toString();
        return;
      }
      const raw = data.content?.map(b => b.text || "").join("");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      const items = buildReviewItems(result, type, selectedClient, selectedSessionType);
      setReviewItems(items);
      setAccepted({});
      setProposedSessions([]);
      setTrail(t => [...t, "Review"]);
      setStep("review");
   } catch {
  showToast("AI match failed. Error code: AI_MATCH_FAILED");
  setError("Could not complete AI match. Please try again.");
}
finally { setLoading(false); }
  }

  const PH = (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Create</h2>
      <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>Build and manage your scheduling calendars</p>
    </div>
  );

  if (step === "quickSlot" && prefill) {
    const fmtHour = h => { const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(prefill.minute).padStart(2, "0")} ${ap}`; };
    const eligibleClients = clients.filter(c => c.status === "active");
    const eligibleStaff = quickType && quickClient
      ? employees.filter(e => e.specialties?.includes(quickType.name) && e.location_id === quickClient.location_id)
      : [];
    const ready = quickClient && quickType && quickStaff && recurring && (recurring === "no" || (endType && (endType === "date" ? endDate : endCount)));

    return (
      // No PH here (unlike every other step) - this always renders inside
      // the popup added in the root Scheduler component now, and "Create /
      // Build and manage your scheduling calendars" is a full-page header
      // that has no business taking up space in a compact one-session popup.
      <div><Trail steps={trail} onBack={goBack} />
        <StepCard question="New session" sub={`${dayFromDate(prefill.dateStr)} ${prefill.dateStr} at ${fmtHour(prefill.hour)}`}>
          {!selectedCalendar ? (
            <>
              <div style={{ fontSize: 13, color: COLORS.textS, marginBottom: 10 }}>This date isn't covered by an existing calendar — pick one or create one.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                {calendars.filter(c => c.status !== "archived").map(cal => (
                  <OptionButton key={cal.id} label={cal.name} sub={cal.status} selected={selectedCalendar?.id === cal.id} onClick={() => setSelectedCalendar(cal)} />
                ))}
                <OptionButton label="+ New calendar" selected={showNewCal} color="#EF9F27" onClick={() => setShowNewCal(v => !v)} />
              </div>
              {showNewCal && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, padding: 16, borderRadius: 10, background: COLORS.bg, border: `0.5px solid ${COLORS.border}` }}>
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.textT, marginBottom: 4 }}>Name</div>
                    <input type="text" value={newCalName} onChange={e => setNewCalName(e.target.value)} placeholder={getNextQuarterPlaceholder()} style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 180 }} />
                  </div>
                  <button onClick={() => createCalendar()} disabled={calCreating || !newCalName} style={{ padding: "7px 20px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>{calCreating ? "Creating…" : "Create"}</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.textT, marginBottom: 14 }}>Calendar: <b style={{ color: COLORS.text }}>{selectedCalendar.name}</b></div>
          )}
        </StepCard>

        {selectedCalendar && (
          <StepCard question="Client">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {eligibleClients.map(c => <OptionButton key={c.id} label={c.name} selected={quickClient?.id === c.id} onClick={() => { setQuickClient(c); setQuickStaff(null); }} />)}
            </div>
          </StepCard>
        )}

        {selectedCalendar && quickClient && (
          <StepCard question="Session type">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sessionTypes.map(t => <OptionButton key={t.id} label={t.name} color={t.color} selected={quickType?.id === t.id} onClick={() => { setQuickType(t); setQuickStaff(null); }} />)}
            </div>
          </StepCard>
        )}

        {selectedCalendar && quickClient && quickType && (
          <StepCard question="Clinician" sub={!eligibleStaff.length ? "No clinician at this client's location is qualified for this session type." : undefined}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {eligibleStaff.map(e => <OptionButton key={e.id} label={e.name} sub={`${e.role} · ${e.booked}/${e.capacity}`} color="#378ADD" selected={quickStaff?.id === e.id} onClick={() => setQuickStaff(e)} />)}
            </div>
          </StepCard>
        )}

        {selectedCalendar && quickClient && quickType && quickStaff && (
          <StepCard question="Location">
            <div style={{ display: "flex", gap: 10, marginBottom: quickIsHome ? 10 : 0 }}>
              <OptionButton label={locations.find(l => l.id === quickStaff.location_id)?.name || "Clinic"} sub="Clinician's location" selected={!quickIsHome} onClick={() => setQuickIsHome(false)} />
              <OptionButton label="Client's home" sub="Home visit" selected={quickIsHome} onClick={() => { setQuickIsHome(true); if (!quickHomeAddress) setQuickHomeAddress(quickClient.address || ""); }} />
            </div>
            {quickIsHome && (
              <input type="text" value={quickHomeAddress} onChange={e => setQuickHomeAddress(e.target.value)} placeholder="Address"
                style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 280 }} />
            )}
          </StepCard>
        )}

        {selectedCalendar && quickClient && quickType && quickStaff && (
          <StepCard question="Is this a recurring schedule?">
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <OptionButton label="No" sub="One-time only" selected={recurring === "no"} onClick={() => { setRecurring("no"); setEndType(null); }} />
              <OptionButton label="Yes" sub="Repeats weekly" selected={recurring === "yes"} onClick={() => { setRecurring("yes"); setEndType(null); }} />
            </div>
            {recurring === "yes" && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <OptionButton label="By date" selected={endType === "date"} onClick={() => setEndType("date")} />
                  <OptionButton label="By session count" selected={endType === "count"} onClick={() => setEndType("count")} />
                </div>
                {endType === "date" && <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14 }} />}
                {endType === "count" && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="number" min={1} value={endCount} onChange={e => setEndCount(e.target.value)} placeholder="e.g. 12" style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 110 }} />
                  <span style={{ fontSize: 14, color: COLORS.textS }}>sessions total</span>
                </div>}
              </>
            )}
          </StepCard>
        )}

        {error && <div style={{ padding: "12px 16px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", color: "#A32D2D", fontSize: 14, marginBottom: 16 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          {ready && <button onClick={bookQuickSlot} disabled={booking} style={{ padding: "10px 28px", borderRadius: 10, background: "#5DCAA5", color: "#fff", border: "none", cursor: booking ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 500, opacity: booking ? 0.7 : 1 }}>{booking ? "Booking…" : "Book session"}</button>}
          <button onClick={() => onConsumedPrefill?.()} disabled={booking} style={{ padding: "10px 20px", borderRadius: 10, background: COLORS.bgS, color: COLORS.textS, border: `0.5px solid ${COLORS.border}`, cursor: booking ? "not-allowed" : "pointer", fontSize: 15 }}>Cancel</button>
        </div>

        {pendingConflict && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={e => { if (e.target === e.currentTarget) setPendingConflict(null); }}>
            <div ref={pendingConflictTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Scheduling conflict" style={{ width: 380, background: COLORS.bg, borderRadius: 14, padding: "24px 26px", border: `0.5px solid ${COLORS.borderS}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>Scheduling conflict</div>
              <p style={{ fontSize: 13, color: COLORS.textS, margin: "0 0 14px" }}>{pendingConflict.message}</p>
              {pendingConflict.suggestions.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.04em", marginBottom: 8 }}>SUGGESTED ALTERNATIVES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pendingConflict.suggestions.map((s, i) => (
                      <button key={i}
                        onClick={() => {
                          const staff = s.employeeId === quickStaff.id ? quickStaff : employees.find(e => e.id === s.employeeId);
                          insertQuickSlot({ dateStr: s.dateStr, hour: s.hour, minute: s.minute, staff });
                        }}
                        style={{ padding: "9px 12px", borderRadius: 8, textAlign: "left", border: `0.5px solid ${COLORS.border}`, background: COLORS.bgS, color: COLORS.text, cursor: "pointer", fontSize: 13 }}>
                        {s.kind === "same-clinician" ? `${quickStaff.name} — ${s.label}` : s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => insertQuickSlot({ dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute, staff: quickStaff })}
                  disabled={booking}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#FCE8E8", color: "#A33A3A", border: "none", cursor: booking ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500 }}>
                  Book anyway
                </button>
                <button onClick={() => setPendingConflict(null)}
                  style={{ padding: "9px 16px", borderRadius: 8, background: COLORS.bgS, color: COLORS.textS, border: `0.5px solid ${COLORS.border}`, cursor: "pointer", fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "calendar") return (
    <div>{PH}
      <StepCard question="Which calendar are you working with?" sub="Draft calendars stay off the live calendar and out of conflict checks until you confirm them.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          {calendars.filter(c => c.status !== "archived").map(cal => {
            const isSelected = selectedCalendar?.id === cal.id;
            const isEditing = editingCalId === cal.id;
            const isHovered = hoveredCalId === cal.id || focusedCalId === cal.id;
            const isDraft = cal.status === "draft";
            const color = cal.status === "active" ? "#5DCAA5" : "#378ADD";
            return (
              <div key={cal.id} style={{ position: "relative", display: "inline-block" }}
                onMouseEnter={() => setHoveredCalId(cal.id)}
                onMouseLeave={() => setHoveredCalId(null)}
                onFocus={() => setFocusedCalId(cal.id)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusedCalId(null); }}>
                <div onClick={() => !isEditing && setSelectedCalendar(cal)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={e => { if (!isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedCalendar(cal); } }}
                  style={{ padding: "11px 18px", borderRadius: 10, border: `1.5px solid ${isSelected ? color : COLORS.border}`, background: isSelected ? color + "18" : COLORS.bg, cursor: "pointer", minWidth: 130, transition: "all 0.15s" }}>
                  {isEditing ? (
                    <input autoFocus value={editingCalName} onChange={e => setEditingCalName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") renameCalendar(cal.id); if (e.key === "Escape") setEditingCalId(null); }}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 14, fontWeight: 500, border: "none", background: "transparent", color: isSelected ? color : COLORS.text, outline: "none", width: "100%" }} />
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: isSelected ? 500 : 400, color: isSelected ? color : COLORS.text }}>{cal.name}</div>
                      <div style={{ fontSize: 12, color: isSelected ? color : COLORS.textT, marginTop: 3 }}>{cal.status}</div>
                    </>
                  )}
                </div>
                {isHovered && !isEditing && (
                  <div style={{ position: "absolute", top: -8, right: -8, display: "flex", gap: 4, zIndex: 10 }}>
                    {isDraft && (
                      <button onClick={e => { e.stopPropagation(); if (confirm(`Confirm "${cal.name}"? Its sessions become visible on the live calendar immediately.`)) confirmCalendar(cal.id); }}
                        title="Confirm: make this calendar's sessions live"
                        style={{ height: 24, borderRadius: 6, border: "0.5px solid #5DCAA5", background: "#5DCAA5", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 500, padding: "0 8px", display: "flex", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
                        Confirm
                      </button>
                    )}
                    <button aria-label={`Rename ${cal.name}`} onClick={e => { e.stopPropagation(); setEditingCalId(cal.id); setEditingCalName(cal.name); }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>✎</button>
                    <button aria-label={`Archive ${cal.name}`} onClick={e => { e.stopPropagation(); archiveCalendar(cal.id); }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `0.5px solid #F7C1C1`, background: COLORS.bg, color: "#E24B4A", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
          <OptionButton label="+ New calendar" selected={showNewCal} color="#EF9F27" onClick={() => setShowNewCal(v => !v)} />
        </div>
        {showNewCal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, padding: 16, borderRadius: 10, background: COLORS.bg, border: `0.5px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textT, marginBottom: 4 }}>Name</div>
                <input type="text" value={newCalName} onChange={e => setNewCalName(e.target.value)} placeholder={getNextQuarterPlaceholder()} style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 180 }} />
              </div>
              <button onClick={() => createCalendar(createAsDraft)} disabled={calCreating || !newCalName} style={{ padding: "7px 20px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>{calCreating ? "Creating…" : "Create"}</button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.textS, cursor: "pointer" }}>
              <input type="checkbox" checked={createAsDraft} onChange={e => setCreateAsDraft(e.target.checked)} style={{ accentColor: "#5DCAA5" }} />
              Create as draft - stage sessions here first, without them going live on the calendar, until you confirm it
            </label>
          </div>
        )}
        {selectedCalendar && !showNewCal && <button onClick={() => advance("matchCount", selectedCalendar.name)} style={{ padding: "8px 22px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Continue →</button>}
      </StepCard>
    </div>
  );

  if (step === "matchCount") return (
    <div>{PH}<Trail steps={trail} onBack={goBack} />
      <StepCard question="How many client-to-staff matches do you want to create?">
        <div style={{ display: "flex", gap: 10 }}>
          <OptionButton label="One" sub="Single client match" selected={matchCount === "one"} onClick={() => { setMatchCount("one"); advance("location", "One match"); }} />
          <OptionButton label="Multiple" sub="Batch matching" selected={matchCount === "multiple"} onClick={() => { setMatchCount("multiple"); advance("multiClient", "Multiple matches"); }} />
        </div>
      </StepCard>
    </div>
  );

  if (step === "location") return (
    <div>{PH}<Trail steps={trail} onBack={goBack} />
      <StepCard question="Which location?">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {locations.map(loc => <OptionButton key={loc.id} label={loc.name} sub={loc.address} selected={selectedLocation?.id === loc.id} onClick={() => { setSelectedLocation(loc); advance("client", loc.name); }} />)}
        </div>
      </StepCard>
    </div>
  );

  if (step === "client") {
    const locClients = clients.filter(c => c.location_id === selectedLocation?.id);
    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="Which client?">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {locClients.map(c => <OptionButton key={c.id} label={c.name} sub={c.status === "active" ? "Active" : "Waitlist"} selected={selectedClient?.id === c.id} color={c.status === "active" ? "#5DCAA5" : "#EF9F27"} onClick={() => { setSelectedClient(c); setSelectedSessionType(null); advance("sessionType", c.name); }} />)}
          </div>
        </StepCard>
      </div>
    );
  }

  if (step === "sessionType") return (
    <div>{PH}<Trail steps={trail} onBack={goBack} />
      <StepCard question="Session type?">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {sessionTypes.map(st => <OptionButton key={st.id} label={st.name} sub={`${st.duration} min · $${st.price}`} selected={selectedSessionType?.id === st.id} color={typeColors[st.name] || "#888888"} onClick={() => { setSelectedSessionType(st); advance("staff", st.name); }} />)}
        </div>
      </StepCard>
    </div>
  );

  if (step === "staff") {
    const eligible = employees.filter(e => e.specialties?.includes(selectedSessionType?.name) && e.booked < e.capacity && e.location_id === selectedClient?.location_id);
    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="Staff preference?">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <OptionButton label="Any" sub="AI selects best match" selected={staffChoice === "any"} onClick={() => { setStaffChoice("any"); setSelectedStaff(null); advance("time", "Any staff"); }} />
            {eligible.map(e => <OptionButton key={e.id} label={e.name} sub={`${e.role} · ${e.booked}/${e.capacity}`} selected={selectedStaff?.id === e.id} color="#378ADD" onClick={() => { setStaffChoice("specific"); setSelectedStaff(e); advance("time", e.name); }} />)}
          </div>
        </StepCard>
      </div>
    );
  }

  if (step === "time") {
    const ready = sessionsPerWeek && recurring && (recurring === "no" || (endType && (endType === "date" ? endDate : endCount)));
    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="How many sessions per week?">
          <div style={{ display: "flex", gap: 10 }}>
            {[1, 2, 3, 4, 5].map(n => <OptionButton key={n} label={`${n}x`} selected={sessionsPerWeek === n} onClick={() => setSessionsPerWeek(n)} />)}
          </div>
        </StepCard>
        {sessionsPerWeek && <StepCard question="Is this a recurring schedule?">
          <div style={{ display: "flex", gap: 10 }}>
            <OptionButton label="Yes" sub="Repeating schedule" selected={recurring === "yes"} onClick={() => { setRecurring("yes"); setEndType(null); }} />
            <OptionButton label="No" sub="One-time only" selected={recurring === "no"} onClick={() => { setRecurring("no"); setEndType(null); }} />
          </div>
        </StepCard>}
        {recurring === "yes" && <StepCard question="When does it end?">
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <OptionButton label="By date" selected={endType === "date"} onClick={() => setEndType("date")} />
            <OptionButton label="By session count" selected={endType === "count"} onClick={() => setEndType("count")} />
          </div>
          {endType === "date" && <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14 }} />}
          {endType === "count" && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="number" min={1} value={endCount} onChange={e => setEndCount(e.target.value)} placeholder="e.g. 12" style={{ padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14, width: 110 }} />
            <span style={{ fontSize: 14, color: COLORS.textS }}>sessions total</span>
          </div>}
        </StepCard>}
        {error && <div style={{ padding: "12px 16px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", color: "#A32D2D", fontSize: 14, marginBottom: 16 }}>{error}</div>}
        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textS, fontSize: 15 }}><div style={{ fontSize: 26, marginBottom: 10, animation: "pulse 1.5s infinite" }}>✦</div>Analyzing schedules…</div>}
        {ready && !loading && <button onClick={() => runMatch(matchCount)} style={{ padding: "10px 28px", borderRadius: 10, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500 }}>✦ Find matches</button>}
      </div>
    );
  }

  if (step === "multiClient") {
    const currentTab = activeTab || sessionTypes[0]?.name || "";
    const activeClients = currentTab === "Assessment"
      ? clients.filter(c => c.status === "active" || c.status === "waitlist")
      : clients.filter(c => c.status === "active");

    const isSelected = (clientId, stName) => multiClients.some(mc => mc.client.id === clientId && mc.session_type === stName);

    function toggleClient(c, stName) {
      if (isSelected(c.id, stName)) {
        setMultiClients(prev => prev.filter(mc => !(mc.client.id === c.id && mc.session_type === stName)));
      } else {
        setMultiClients(prev => [...prev, { client: c, session_type: stName, key: `${c.id}-${stName}-${Date.now()}` }]);
      }
    }

    function selectAll(stName) {
      const toAdd = activeClients
        .filter(c => !isSelected(c.id, stName))
        .map(c => ({ client: c, session_type: stName, key: `${c.id}-${stName}-${Date.now()}` }));
      setMultiClients(prev => [...prev, ...toAdd]);
    }

    function clearAll(stName) {
      setMultiClients(prev => prev.filter(mc => mc.session_type !== stName));
    }

    const tabCount = (stName) => multiClients.filter(mc => mc.session_type === stName).length;

    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="Which clients do you want to match?">
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {sessionTypes.map(st => {
              const count = tabCount(st.name);
              const active = (activeTab || sessionTypes[0]?.name) === st.name;
              return (
                <button key={st.id} onClick={() => setActiveTab(st.name)}
                  style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${active ? st.color : COLORS.border}`, background: active ? st.color + "22" : COLORS.bg, color: active ? st.color : COLORS.textS, transition: "all 0.15s" }}>
                  {st.name}{count > 0 ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <button onClick={() => selectAll(currentTab)}
              style={{ padding: "4px 14px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
              Select all
            </button>
            <button onClick={() => clearAll(currentTab)}
              style={{ padding: "4px 14px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
              Clear
            </button>
            <span style={{ fontSize: 13, color: COLORS.textT }}>{activeClients.length} eligible</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {activeClients.map(c => {
              const sel = isSelected(c.id, currentTab);
              return (
                <button key={c.id} onClick={() => toggleClient(c, currentTab)}
                  style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, border: `1px solid ${sel ? "#5DCAA5" : COLORS.border}`, background: sel ? "#5DCAA518" : COLORS.bg, color: sel ? "#0F6E56" : COLORS.text, cursor: "pointer", fontWeight: sel ? 500 : 400 }}>
                  {c.name}
                </button>
              );
            })}
          </div>
          {multiClients.length > 0 && (
            <button onClick={() => advance("time", `${multiClients.length} clients`)}
              style={{ marginTop: 16, padding: "8px 22px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
              Continue with {multiClients.length} client{multiClients.length !== 1 ? "s" : ""} →
            </button>
          )}
        </StepCard>
      </div>
    );
  }

  if (step === "review") {
    const groupTypes = sessionTypes.filter(st => st.max_clients > 1).map(st => st.name);
    const groupBuckets = {};
    const individualItems = [];
    reviewItems.forEach(item => {
      if (groupTypes.includes(item.sessionType)) {
        if (!groupBuckets[item.sessionType]) groupBuckets[item.sessionType] = [];
        groupBuckets[item.sessionType].push(item);
      } else {
        individualItems.push(item);
      }
    });
    const sortedItems = [...individualItems, ...Object.values(groupBuckets).flat()];
    const totalAccepted = Object.values(accepted).filter(v => v === true).length;

    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <div style={{ marginBottom: 20 }}>
          <PreviewGrid
            proposedSessions={proposedSessions}
            setProposedSessions={setProposedSessions}
            existingSessions={bookings}
            staffAvailability={staffAvailability}
            clientAvailability={clientAvailability}
            employees={employees}
            clients={clients}
            locations={locations}
            sessionTypes={sessionTypes}
            unmatchedClients={[]}
            typeColors={typeColors}
            workDays={workDays}
            workStart={workStart}
            workEnd={workEnd}
          />
        </div>
        <div style={{ borderTop: `0.5px solid ${COLORS.border}`, paddingTop: 20, marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>
            Matches — {sortedItems.length} client{sortedItems.length !== 1 ? "s" : ""}
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
            {individualItems.map((item, i) => (
              <ClientMatchCard key={i} item={item} accepted={accepted} onAccept={handleAccept} onReject={handleReject} typeColors={typeColors} />
            ))}
            {Object.entries(groupBuckets).map(([stName, groupItems]) => {
              const st = sessionTypes.find(s => s.name === stName);
              return (
                <GroupSessionCard key={stName} items={groupItems} sessionTypeName={stName} maxClients={st?.max_clients ?? 3}
                  accepted={accepted} onAccept={handleAccept} onReject={handleReject} typeColors={typeColors} />
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 14, alignItems: "center", paddingTop: 16, borderTop: `0.5px solid ${COLORS.border}` }}>
          <button onClick={handleConfirmAndBook} disabled={booking || totalAccepted === 0}
            style={{ padding: "10px 28px", borderRadius: 10, background: totalAccepted > 0 ? "#5DCAA5" : COLORS.bgT, color: totalAccepted > 0 ? "#fff" : COLORS.textT, border: "none", cursor: totalAccepted > 0 ? "pointer" : "not-allowed", fontSize: 15, fontWeight: 500 }}>
            {booking ? "Booking…" : `✓ Confirm & Book (${totalAccepted} session${totalAccepted !== 1 ? "s" : ""})`}
          </button>
          <div style={{ fontSize: 13, color: COLORS.textS }}>
            {recurring === "yes" ? `Recurring · ${endType === "date" ? `ends ${endDate}` : `${endCount} sessions`}` : "One-time sessions"}
          </div>
        </div>
      </div>
    );
  }

  if (step === "booked") return (
    <div>{PH}
      <div style={{ padding: "48px 32px", textAlign: "center", borderRadius: 14, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 38, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 500, color: COLORS.text, marginBottom: 8 }}>Sessions booked</div>
        <div style={{ fontSize: 14, color: COLORS.textS, marginBottom: 28 }}>All sessions have been added to {selectedCalendar?.name}. View them in the Calendar tab.</div>
        <button onClick={() => { setStep("calendar"); setTrail([]); setReviewItems([]); setAccepted({}); setProposedSessions([]); setMultiClients([]); setMatchCount(null); }}
          style={{ padding: "10px 24px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
          Create more sessions
        </button>
      </div>
    </div>
  );

  return null;
}

// ─── Sessions view ─────────────────────────────────────────────────────────────

function SessionsView({ clients, employees, sessionTypes, bookings, calendars, locations, staffAvailability, clientAvailability, workStart, workEnd, refreshBookings, showToast, typeColors }) {
  const appUser = useContext(UserContext);
  const role = appUser?.role || "client";
  const isAdminOrScheduler = role === "admin" || role === "scheduler";
  const clinicId = appUser?.clinic_id || "";
  const incrementMinutes = Number(getSetting("calendar.gridIncrementMinutes")) || 15;

  // The session click-popup, shared with the real calendar tab (see
  // components/calendar/SessionDetail.tsx's header) - this list previously
  // had no "click a session to see it" affordance at all, only the pencil/✕
  // row actions below (left untouched). Clicking a session's name opens the
  // same popup, including the "View both schedules" dual mini-calendar.
  const [detailSession, setDetailSession] = useState(null);
  const [reschedulingSession, setReschedulingSession] = useState(null);
  const [rescheduleInitialSlot, setRescheduleInitialSlot] = useState(null);

  const [calFilter, setCalFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("scheduled");
  const [typeFilter, setTypeFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  // This modal had no Escape-to-close at all (every other modal in this
  // wizard does) - only its own Cancel button closed it.
  useEffect(() => {
    if (!rescheduleTarget) return;
    const onKey = e => { if (e.key === "Escape") setRescheduleTarget(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rescheduleTarget]);
  const rescheduleTrapRef = useFocusTrap(!!rescheduleTarget);
  const [proposeDay, setProposeDay] = useState("Mon");
  const [proposeHour, setProposeHour] = useState(9);
  const [proposeDate, setProposeDate] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  const [sortKey, setSortKey] = useState("session_date");
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const CANCEL_HOURS = 24;

  const filtered = (bookings || []).filter(b => {
    if (calFilter !== "all" && b.calendar_id !== Number(calFilter)) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (typeFilter !== "all" && b.type !== typeFilter) return false;
    if (staffFilter !== "all" && b.employee_id !== Number(staffFilter)) return false;
    if (search) {
      const client = clients.find(c => c.id === b.client_id);
      const emp = employees.find(e => e.id === b.employee_id);
      const q = search.toLowerCase();
      if (!client?.name?.toLowerCase().includes(q) && !emp?.name?.toLowerCase().includes(q) && !b.type?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    let av, bv;
    if (sortKey === "session_date") { av = `${a.session_date}${a.hour}`; bv = `${b.session_date}${b.hour}`; }
    else if (sortKey === "client") { av = clients.find(c => c.id === a.client_id)?.name || ""; bv = clients.find(c => c.id === b.client_id)?.name || ""; }
    else if (sortKey === "staff") { av = employees.find(e => e.id === a.employee_id)?.name || ""; bv = employees.find(e => e.id === b.employee_id)?.name || ""; }
    else if (sortKey === "location") { av = locations?.find(l => l.id === employees.find(e => e.id === a.employee_id)?.location_id)?.name || ""; bv = locations?.find(l => l.id === employees.find(e => e.id === b.employee_id)?.location_id)?.name || ""; }
    else if (sortKey === "type") { av = a.type || ""; bv = b.type || ""; }
    else if (sortKey === "status") { av = a.status || ""; bv = b.status || ""; }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(b => b.id)));
  }

  async function cancelSelected() {
    const ids = [...selected];
    const now = new Date();
    const lateCount = ids.filter(id => {
      const b = bookings.find(s => s.id === id);
      if (!b?.session_date) return false;
      const sessionTime = new Date(`${b.session_date}T${String(b.hour).padStart(2, "0")}:00:00`);
      return (sessionTime - now) / 36e5 < CANCEL_HOURS;
    }).length;
    const msg = lateCount > 0
      ? `${lateCount} of ${ids.length} session(s) are within the ${CANCEL_HOURS}-hour cancellation window. Cancel anyway?`
      : `Cancel ${ids.length} session(s)?`;
    if (!confirm(msg)) return;
    setCancelling(true);
    const { error: err } = await supabase.from("sessions").update({ status: "cancelled" }).in("id", ids);
    setCancelling(false);
    setSelected(new Set());
    refreshBookings();
    // Previously showed "N cancelled" regardless of whether the write
    // actually succeeded - optimistic UI with no failure path at all.
    showToast(err ? "Cancel failed. Please try again." : `${ids.length} session${ids.length !== 1 ? "s" : ""} cancelled`);
  }

  function exportICS() {
    const toExport = selected.size > 0 ? filtered.filter(b => selected.has(b.id)) : filtered;
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Summit Scheduler//EN"];
    // DTSTART/DTEND previously emitted the local wall-clock time with no `Z`
    // suffix and no TZID - "floating" time per RFC 5545, which an importing
    // calendar app interprets in ITS OWN configured zone, not the clinic's.
    // A 9am Eastern session imported into a calendar set to Pacific shows at
    // 9am Pacific. Converting through a real Date - built from the session's
    // own local date/hour/minute, so it picks up this browser's timezone
    // (the clinic's, for on-site scheduling staff) and that exact date's DST
    // state - to a UTC `Z` timestamp makes the exported time unambiguous
    // everywhere without hand-building a VTIMEZONE component. This is a
    // deliberate, correct use of toISOString() for a real UTC instant - not
    // the earlier day-boundary bug (see git history) where it was used to
    // extract a date string from "now," which is a different, unsafe use.
    const toICSUTC = (date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    toExport.forEach(b => {
      const client = clients.find(c => c.id === b.client_id);
      const emp = employees.find(e => e.id === b.employee_id);
      const st = sessionTypes.find(s => s.name === b.type);
      const dur = st?.duration || 60;
      const [y, mo, d] = (b.session_date || "").split("-").map(Number);
      if (!y || !mo || !d) return;
      // b.minute was dropped entirely before (both start and end always
      // computed as if the session began exactly on the hour), so anything
      // on this app's 15/30-minute scheduling grid exported at the wrong
      // start AND end time.
      const start = new Date(y, mo - 1, d, b.hour, b.minute || 0);
      const end = new Date(start.getTime() + dur * 60000);
      lines.push("BEGIN:VEVENT",
        `DTSTART:${toICSUTC(start)}`,
        `DTEND:${toICSUTC(end)}`,
        `SUMMARY:${b.type} – ${client?.name || "Client"}`,
        `DESCRIPTION:Staff: ${emp?.name || "—"} | Status: ${b.status}`,
        "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "sessions.ics" });
    a.click();
  }

  async function submitReschedule() {
    if (!proposeDate) return;
    setRescheduleSaving(true);
    setRescheduleError(null);
    // This write previously had no conflict check at all (not even against
    // stale local state - the other reschedule paths at least had that) and
    // never checked its own result, so "Session rescheduled" showed
    // regardless of whether the write actually succeeded or silently
    // double-booked the clinician. minute is preserved from the existing
    // row - this modal only ever lets someone change the hour, and the
    // update below never touches `minute`.
    const fresh = await fetchFreshConflict(
      { employeeId: rescheduleTarget.employee_id, dateStr: proposeDate, hour: proposeHour, minute: rescheduleTarget.minute },
      rescheduleTarget.id,
    );
    if (fresh) {
      setRescheduleSaving(false);
      setRescheduleError("That slot was just booked by someone else - pick another time.");
      return;
    }
    const { error: err } = await supabase.from("sessions").update({
      session_date: proposeDate,
      hour: proposeHour,
    }).eq("id", rescheduleTarget.id);
    setRescheduleSaving(false);
    if (err) { setRescheduleError("Reschedule failed. Please try again."); return; }
    refreshBookings();
    showToast("Session rescheduled");
    setRescheduleTarget(null);
  }

  const selInput = { padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Sessions</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>{filtered.length} session{filtered.length !== 1 ? "s" : ""}{selected.size > 0 ? ` · ${selected.size} selected` : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selected.size > 0 && isAdminOrScheduler && (
            <button onClick={cancelSelected} disabled={cancelling}
              style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: "#FCEBEB", color: "#A32D2D", opacity: cancelling ? 0.6 : 1 }}>
              {cancelling ? "Cancelling…" : `Cancel (${selected.size})`}
            </button>
          )}
          <button onClick={exportICS}
            style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
            ↓ Export .ics{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Search client, staff, type…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...selInput, width: 220 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selInput}>
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={calFilter} onChange={e => setCalFilter(e.target.value)} style={selInput}>
          <option value="all">All calendars</option>
          {(calendars || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selInput}>
          <option value="all">All types</option>
          {(sessionTypes || []).map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
        </select>
        {isAdminOrScheduler && (
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} style={selInput}>
            <option value="all">All staff</option>
            {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        {(search || statusFilter !== "scheduled" || calFilter !== "all" || typeFilter !== "all" || staffFilter !== "all") && (
          <button onClick={() => { setSearch(""); setStatusFilter("scheduled"); setCalFilter("all"); setTypeFilter("all"); setStaffFilter("all"); }}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textT, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 140px 100px 80px 80px", gap: 0, padding: "6px 12px", borderRadius: "8px 8px 0 0", background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, borderBottom: "none" }}>
        <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
        {[["Client", "client"], ["Staff", "staff"], ["Location", "location"], ["Type", "type"], ["Date & Time", "session_date"], ["Status", "status"]].map(([label, key]) => (
          <div key={key} onClick={() => toggleSort(key)}
            style={{ fontSize: 12, fontWeight: 600, color: sortKey === key ? COLORS.text : COLORS.textT, letterSpacing: "0.04em", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
            {label}
            <span style={{ fontSize: 10, opacity: sortKey === key ? 1 : 0.3 }}>{sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
          </div>
        ))}
        <div />
      </div>

      <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
       {bookings.length === 0 ? (
  <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
    No sessions yet
  </div>
) : filtered.length === 0 ? (
  <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
    No sessions match your filters
  </div>
) : null}
        {filtered.map((b, i) => {
          const client = clients.find(c => c.id === b.client_id);
          const emp = employees.find(e => e.id === b.employee_id);
          const col = typeColors[b.type] || "#888";
          const isSel = selected.has(b.id);
          const isCancelled = b.status === "cancelled";
          const now = new Date();
          const sessionTime = b.session_date ? new Date(`${b.session_date}T${String(b.hour).padStart(2, "0")}:00:00`) : null;
          const lateCancel = sessionTime && (sessionTime - now) / 36e5 < CANCEL_HOURS;
          const bDay = b.session_date ? dayFromDate(b.session_date) : "—";
          return (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 140px 100px 80px 80px", gap: 0, padding: "10px 12px", borderBottom: i < filtered.length - 1 ? `0.5px solid ${COLORS.border}` : "none", background: isSel ? COLORS.bgS : COLORS.bg, opacity: isCancelled ? 0.55 : 1, alignItems: "center", transition: "background 0.1s" }}>
              <input type="checkbox" checked={isSel} onChange={() => toggleSelect(b.id)} style={{ cursor: "pointer" }} />
              <div
                role="button" tabIndex={0} aria-label={`View session details for ${client?.name || "this session"}`}
                onClick={() => setDetailSession(b)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailSession(b); } }}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              >
                <Avatar name={client?.name || "?"} size={28} color="#378ADD" />
                <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{client?.name || "—"}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textS }}>{emp?.name || "—"}</div>
              <div style={{ fontSize: 13, color: COLORS.textS }}>{locations?.find(l => l.id === emp?.location_id)?.name || "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: COLORS.text }}>{b.type}</span>
                {b.recurrence_id && <span title="Recurring" style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "#378ADD18", color: "#378ADD", border: "0.5px solid #378ADD44" }}>R</span>}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textS }}>
                <div>{b.session_date}</div>
                <div style={{ fontSize: 12, color: COLORS.textT }}>{bDay} {b.hour}:00{lateCancel && !isCancelled ? <span title="Within cancellation window" style={{ color: "#EF9F27", marginLeft: 4 }}>⚠</span> : null}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: isCancelled ? "#88888820" : "#5DCAA520", color: isCancelled ? COLORS.textT : "#5DCAA5", border: `0.5px solid ${isCancelled ? COLORS.border : "#5DCAA544"}` }}>
                  {b.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {!isCancelled && (
                  <>
                    <button title={isAdminOrScheduler ? "Reschedule" : "Propose reschedule"}
                      aria-label={isAdminOrScheduler ? "Reschedule session" : "Propose reschedule"}
                      onClick={() => { setRescheduleTarget(b); setProposeDay(b.session_date ? dayFromDate(b.session_date) : "Mon"); setProposeHour(b.hour); setProposeDate(b.session_date || ""); setRescheduleError(null); }}
                      style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer", fontSize: 14 }}>✎</button>
                    {isAdminOrScheduler && (
                      <button title="Cancel" aria-label="Cancel session" onClick={async () => {
                        if (!confirm(lateCancel ? `Within the ${CANCEL_HOURS}-hour window. Cancel anyway?` : "Cancel this session?")) return;
                        const { error: err } = await supabase.from("sessions").update({ status: "cancelled" }).eq("id", b.id);
                        refreshBookings();
                        showToast(err ? "Cancel failed. Please try again." : "Session cancelled");
                      }} style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid #F7C1C1`, background: COLORS.bg, color: "#E24B4A", cursor: "pointer", fontSize: 14 }}>✕</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reschedule modal */}
      {rescheduleTarget && (() => {
        const client = clients.find(c => c.id === rescheduleTarget.client_id);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div ref={rescheduleTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Reschedule session" style={{ background: COLORS.bg, borderRadius: 14, padding: 28, width: 380, border: `0.5px solid ${COLORS.borderS}`, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text, marginBottom: 4 }}>
                Reschedule session
              </div>
              <div style={{ fontSize: 13, color: COLORS.textS, marginBottom: 20 }}>
                {client?.name} · {rescheduleTarget.type}
              </div>
              {rescheduleError && <div style={{ fontSize: 12, color: "#A32D2D", marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: "#FCEBEB" }}>{rescheduleError}</div>}
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: COLORS.textT, marginBottom: 4 }}>New date</div>
                  <input type="date" value={proposeDate} onChange={e => setProposeDate(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: COLORS.textT, marginBottom: 4 }}>Hour</div>
                  <select value={proposeHour} onChange={e => setProposeHour(Number(e.target.value))}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13 }}>
                    {Array.from({ length: 13 }, (_, i) => i + 7).map(h => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={submitReschedule} disabled={rescheduleSaving}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: rescheduleSaving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500, opacity: rescheduleSaving ? 0.7 : 1 }}>
                  {rescheduleSaving ? "Saving…" : "Confirm"}
                </button>
                <button onClick={() => { setRescheduleTarget(null); setRescheduleError(null); }} disabled={rescheduleSaving}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer", fontSize: 14 }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {detailSession && (
        <SessionDetail
          session={detailSession} clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes} typeColors={typeColors}
          isDraft={(calendars || []).find(c => c.id === detailSession.calendar_id)?.status === "draft"}
          staffAvailability={staffAvailability || []} clientAvailability={clientAvailability || []}
          clinicId={clinicId} workStartHour={workStart} workEndHour={workEnd} incrementMinutes={incrementMinutes}
          onClose={() => setDetailSession(null)}
          onReschedule={proposedSlot => { setRescheduleInitialSlot(proposedSlot || null); setReschedulingSession(detailSession); setDetailSession(null); }}
          onCancelled={() => { setDetailSession(null); refreshBookings(); showToast("Session cancelled"); }}
        />
      )}

      {reschedulingSession && (
        <RescheduleModal
          session={reschedulingSession}
          client={clients.find(c => c.id === reschedulingSession.client_id)}
          employees={employees} locations={locations} sessionTypes={sessionTypes}
          liveSessions={(bookings || []).filter(b => b.status !== "cancelled")}
          staffAvailability={staffAvailability || []} clientAvailability={clientAvailability || []}
          clinicId={clinicId} workStartHour={workStart} workEndHour={workEnd} orgIncrementMinutes={incrementMinutes}
          initialSlot={rescheduleInitialSlot}
          onClose={() => { setReschedulingSession(null); setRescheduleInitialSlot(null); }}
          onSaved={message => { setReschedulingSession(null); setRescheduleInitialSlot(null); refreshBookings(); showToast(message); }}
        />
      )}
    </div>
  );
}

// ─── Scheduler (root) ─────────────────────────────────────────────────────────

export default function Scheduler() {
  const appUser = useContext(UserContext);
  const router = useRouter();
  const [view, setView] = useState("dashboard");

  useEffect(() => {
    if (!router.isReady) return;
    const requestedView = router.query.view;
    const validViews = ["dashboard", "calendar", "sessions", "clients", "employees", "sessiontypes", "create", "settings"];
    if (typeof requestedView === "string" && validViews.includes(requestedView)) {
      setView(requestedView);
      void router.replace("/", undefined, { shallow: true });
    }
  }, [router.isReady, router.query.view]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [locations, setLocations] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [staffAvailability, setStaffAvailability] = useState([]);
  const [clientAvailability, setClientAvailability] = useState([]);
  const [toast, setToast] = useState(null);
  function showToast(message = "Changes saved") { setToast(message); }

  // Working hours used to be this component's own useState - never saved
  // anywhere, resetting to Mon-Fri/8-18 on every refresh despite the
  // Settings UI implying otherwise. They're real org-level @summit/settings
  // keys now (calendar.workDays/workStart/workEnd); re-render on any change
  // since getSetting() reads a synchronous in-memory cache, not React state.
  const [, forceSettingsTick] = useState(0);
  useEffect(() => onSettingsChange(() => forceSettingsTick(n => n + 1)), []);
  const workDays = String(getSetting("calendar.workDays")).split(",").map(s => s.trim()).filter(Boolean);
  const workStart = parseInt(String(getSetting("calendar.workStart")).split(":")[0], 10);
  const workEnd = parseInt(String(getSetting("calendar.workEnd")).split(":")[0], 10);
  function setWorkDays(updater) {
    const next = typeof updater === "function" ? updater(workDays) : updater;
    void setSetting("calendar.workDays", next.join(","), "org");
  }
  function setWorkStart(hour) { void setSetting("calendar.workStart", `${String(hour).padStart(2, "0")}:00`, "org"); }
  function setWorkEnd(hour) { void setSetting("calendar.workEnd", `${String(hour).padStart(2, "0")}:00`, "org"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [c, e, st, b, l, cal, sa, ca] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("staff").select("*"),
      supabase.from("session_types").select("*"),
      supabase.from("sessions").select("*"),
      supabase.from("locations").select("*"),
      supabase.from("calendars").select("*"),
      supabase.from("staff_availability").select("*"),
      supabase.from("client_availability").select("*"),
    ]);
    if (c.data) setClients(c.data);
    if (e.data) setEmployees(e.data);
    if (st.data) setSessionTypes(st.data);
    if (b.data) setBookings(b.data);
    if (l.data) setLocations(l.data);
    if (cal.data) setCalendars(cal.data);
    if (sa.data) setStaffAvailability(sa.data);
    if (ca.data) setClientAvailability(ca.data);
  }

  async function refreshBookings() {
    const { data } = await supabase.from("sessions").select("*");
    if (data) setBookings(data);
  }

  const typeColors = Object.fromEntries(sessionTypes.map(st => [st.name, st.color]));

  // Click-to-create on the real calendar hands off to the actual Create
  // wizard (its "quickSlot" step) instead of a separate bolt-on form, so
  // recurrence/calendar-term rules stay in one place. See CreateView.
  //
  // Renders as a popup overlay (below), not a page navigation - this used
  // to call setView("create") here, and since nothing ever set `view` back
  // to "calendar" afterward (onConsumedPrefill only cleared the prefill),
  // finishing or cancelling left you stranded on the Create page instead of
  // back on the calendar. Leaving `view` untouched means whatever you were
  // looking at (the calendar) never actually goes anywhere - it's just
  // covered by the popup until this closes.
  const [calendarPrefill, setCalendarPrefill] = useState(null);
  // Click-to-create's quick-slot wizard modal had no Escape-to-close.
  useEffect(() => {
    if (!calendarPrefill) return;
    const onKey = e => { if (e.key === "Escape") setCalendarPrefill(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendarPrefill]);
  const calendarPrefillTrapRef = useFocusTrap(!!calendarPrefill);
  function requestCreateAt(dateStr, hour, minute) {
    setCalendarPrefill({ dateStr, hour, minute });
  }

  // Backs the Dashboard's clickable client/clinician names (PersonLink,
  // above). Neither role has a detail/profile page anywhere in this app, so
  // rather than inventing one, this reuses the real Calendar tab's own
  // filters + date-anchor to scope it down to that person's session -
  // consumed once by CalendarView's `focus` prop, then cleared here so a
  // later, unrelated visit to the Calendar tab doesn't silently reapply it.
  const [calendarFocus, setCalendarFocus] = useState(null);
  function focusPersonOnCalendar({ employeeId, clientId, dateStr, label }) {
    setCalendarFocus({ employeeId: employeeId ?? null, clientId: clientId ?? null, dateStr: dateStr ?? null });
    setView("calendar");
    if (label) showToast(`Calendar filtered to ${label}`);
  }

  const views = { dashboard: Dashboard, calendar: CalendarView, sessions: SessionsView, clients: ClientsView, employees: EmployeesView, sessiontypes: SessionTypesView, create: CreateView, settings: SettingsView };
  const ViewComp = views[view];

  return (
    <>
      {/* Mobile sidebar drawer toggle - see the comment on .scheduler-sidebar
          in styles/globals.css. */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-input" />
      <div className="mobile-topbar">
        <label htmlFor="nav-toggle" className="nav-toggle-btn" aria-label="Open menu">
          <span /><span /><span />
        </label>
        <span className="mobile-topbar-title">Summit Scheduler</span>
      </div>
      <label htmlFor="nav-toggle" className="nav-toggle-backdrop" aria-hidden="true" />
      <div className="scheduler-shell" style={{ display: "flex", minHeight: "100vh", background: COLORS.bgT, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 16 }}>
      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; }
        input::placeholder { font-style: italic; }
        select, input { outline: none; }
        select:focus, input:focus { border-color: var(--color-border-primary) !important; }
        button:active { transform: scale(0.98); }
        .person-link { text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 2px; transition: text-decoration-color 0.1s; }
        .person-link:hover, .person-link:focus-visible { text-decoration-color: currentColor; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-secondary); border-radius: 3px; }
      `}</style>
      <Sidebar
        view={view}
        onNavigate={setView}
        appUser={appUser}
        bookings={bookings}
        calendars={calendars}
      />
      <main style={{ flex: 1, padding: "32px 36px", overflowY: "auto" }}>
        <ViewComp
          clients={clients} setClients={setClients}
          employees={employees} setEmployees={setEmployees}
          sessionTypes={sessionTypes} setSessionTypes={setSessionTypes}
          bookings={bookings}
          locations={locations}
          calendars={calendars} setCalendars={setCalendars}
          staffAvailability={staffAvailability} setStaffAvailability={setStaffAvailability}
          clientAvailability={clientAvailability} setClientAvailability={setClientAvailability}
          refreshBookings={refreshBookings}
          typeColors={typeColors}
          workDays={workDays} setWorkDays={setWorkDays}
          workStart={workStart} setWorkStart={setWorkStart}
          workEnd={workEnd} setWorkEnd={setWorkEnd}
          showToast={showToast}
          onRequestCreate={requestCreateAt}
          prefill={calendarPrefill}
          onConsumedPrefill={() => setCalendarPrefill(null)}
          onFocusPerson={focusPersonOnCalendar}
          focus={calendarFocus}
          onConsumedFocus={() => setCalendarFocus(null)}
        />
      </main>
      {calendarPrefill && (
        <div
          onClick={() => setCalendarPrefill(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          }}
        >
          <div
            ref={calendarPrefillTrapRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Create session"
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(560px, 96vw)", maxHeight: "92vh", overflowY: "auto",
              background: COLORS.bg, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
              position: "relative", padding: "22px 20px 20px",
            }}
          >
            <button
              onClick={() => setCalendarPrefill(null)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%",
                border: `0.5px solid ${COLORS.border}`, background: COLORS.bgS, color: COLORS.textS,
                fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
            <CreateView
              clients={clients} setClients={setClients}
              employees={employees} setEmployees={setEmployees}
              sessionTypes={sessionTypes} setSessionTypes={setSessionTypes}
              bookings={bookings}
              locations={locations}
              calendars={calendars} setCalendars={setCalendars}
              staffAvailability={staffAvailability} setStaffAvailability={setStaffAvailability}
              clientAvailability={clientAvailability} setClientAvailability={setClientAvailability}
              refreshBookings={refreshBookings}
              typeColors={typeColors}
              workDays={workDays}
              workStart={workStart}
              workEnd={workEnd}
              showToast={showToast}
              prefill={calendarPrefill}
              onConsumedPrefill={() => setCalendarPrefill(null)}
            />
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </>
  );
}
