import { useState, useEffect, useRef, useMemo, useContext, Fragment } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";
import { UserContext } from "../lib/UserContext";
import Sidebar, { roleAdmitsView } from "../components/Sidebar";
import SessionTypeEditModal from "../components/SessionTypeEditModal";
import { CalendarView } from "../components/calendar/CalendarView";
import { SessionDetail } from "../components/calendar/SessionDetail";
import { RescheduleModal } from "../components/calendar/RescheduleModal";
import { SearchSelectMenu } from "../components/calendar/FilterPanel";
import { gapsOverlap, parseTimeSetting, toDateStr, todayDateStr } from "../components/calendar/dateUtils";
import { suggestSameClinicianOtherTime, suggestDifferentClinicianSameSlot } from "../components/calendar/suggestions";
import { findSessionType } from "../components/calendar/types";
import { getSetting, setSetting, onSettingsChange } from "@summit/settings";
import { AvailabilityGrid, generateTimeSlots } from "@summit/availability";
import { toast } from "@summit/toast";
import { refreshUrl } from "@summit/portals";
import { canSeeClientIdentity, visibleClient, MASKED_CLIENT_LABEL } from "../lib/sessionPrivacy";
import { isClinicalStaff, utilization, hasOpenCapacity } from "../lib/staff-roles";
import { fetchFreshConflict, fetchFreshConflictKeys, slotKeyOf, isBookingConflictError } from "../lib/checkSlotConflict";
import { useFocusTrap } from "../lib/useFocusTrap";
import { WaitlistView } from "../components/WaitlistView";
import { FrontDeskFeedPanel } from "../components/FrontDeskFeedPanel";
import { Icon } from "@summit/design/icons";
// Moved to lib/ so pages/admin.tsx can page its sessions read too.
import { fetchAllRows } from "../lib/fetch-all-rows";

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

// Shared by the Sessions pager's prev/next. Small enough to inline, defined
// once so the two buttons cannot drift apart.
const navBtnSmallInline = {
  width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${COLORS.border}`,
  background: COLORS.bg, color: COLORS.text, fontSize: 14, lineHeight: 1, padding: 0,
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

function dayFromDate(dateStr) {
  const DAY_MAP = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DAY_MAP[new Date(dateStr + "T12:00:00").getDay()];
}

// generateTimeSlots/availToSlots/slotsToRanges and the AvailabilityGrid
// component itself moved to @summit/availability (2026-09-16) - three
// apps now need the same drag-to-select availability editor (this one, plus
// the self-service tabs on apps/employee's and apps/web's profile pages),
// and the increment was hardcoded to 30 minutes here regardless of
// calendar.gridIncrementMinutes, which the shared version now takes as a
// required parameter instead. buildPreviewSlots below is a different,
// session-creation-preview concept and stays local - not part of that move.

function buildPreviewSlots(startHour, endHour) {
  const s = [];
  for (let h = startHour; h < endHour; h++) {
    s.push({ h, m: 0, label: `${h}:00`, key: `${String(h).padStart(2, "0")}:00` });
    s.push({ h, m: 30, label: "", key: `${String(h).padStart(2, "0")}:30` });
  }
  return s;
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

// AvailabilityGrid itself moved to @summit/availability - see the comment
// above generateTimeSlots' old location. Each call site below now supplies
// its own onSave (the actual Supabase delete+insert, which the shared
// component no longer does itself) and incrementMinutes (read from
// calendar.gridIncrementMinutes instead of the old hardcoded 30).

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
    const anyStaffAvail = employees.some(e => staffAvailAt(e.id, day, tKey, staffAvailability));
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

// The local Toast component that used to live here (top-right, green, 5s)
// moved to @summit/toast, along with pages/admin.tsx's second, differently
// styled one (bottom-right, dark, 3s) - two toasts in one app was already
// the drift the shared package exists to end. showToast() below survives as
// a one-line adapter so this file's call sites are unchanged.

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

/** A picked field collapsed into one compact, removable chip - issue #133
 *  item 9's "selection summary": once client/session-type/clinician are all
 *  chosen in the quickSlot wizard, their three full StepCards give way to a
 *  row of these instead of staying expanded, so the date/time (still shown
 *  in the "New session" header above) and what was picked stay visible at
 *  once instead of scrolling past several already-answered questions.
 *  Clicking the ✕ clears just that one field, which re-expands its own
 *  StepCard again (the collapse condition needs all three set). */
function SelectedPill({ label, value, color, onClear }) {
  const c = color || "#5DCAA5";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", borderRadius: 20, background: c + "14", border: `1px solid ${c}55`, fontSize: 13 }}>
      <span style={{ color: COLORS.textT }}>{label}:</span>
      <span style={{ fontWeight: 500, color: COLORS.text }}>{value}</span>
      <button
        onClick={onClear}
        aria-label={`Change ${label.toLowerCase()}`}
        style={{ border: "none", background: "none", cursor: "pointer", color: c, fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}
      >
        ✕
      </button>
    </span>
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
  const appUser = useContext(UserContext);
  const [staffFilter, setStaffFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const filteredBookings = activeBookings.filter(b => {
    const staffOk = staffFilter === "all" || b.employee_id === Number(staffFilter);
    const clientOk = clientFilter === "all" || b.client_id === Number(clientFilter);
    return staffOk && clientOk;
  });

  // Naming a client in the filter that the list below won't name is the same
  // leak by another route: pick a client, see whose sessions survive. A
  // clinician gets only the clients on their own sessions; admin and
  // scheduler, who see every name anyway, get the whole roster unchanged.
  const seesEveryClient = canSeeClientIdentity(appUser, {});
  const filterClients = seesEveryClient
    ? clients
    : clients.filter(c => activeBookings.some(b => b.client_id === c.id && canSeeClientIdentity(appUser, b)));

  // `staff` is an everyone-who-works-here roster, not a clinician roster -
  // every staff-shaped invite mints a row, an office manager included, with
  // no credential and capacity 0. Capacity and utilization are clinician
  // concepts, so they're computed over ../lib/staff-roles' clinicians only;
  // the Staff TAB deliberately still lists everyone (a hidden row is a row
  // nobody can fix or delete). utilization() also guards the division: a
  // capacity of 0 or null used to make this render the literal "NaN%".
  const clinicians = employees.filter(isClinicalStaff);
  const utilizationPct = clinicians.length
    ? Math.round(clinicians.reduce((a, e) => a + utilization(e), 0) / clinicians.length * 100) : 0;
  const openSlots = clinicians.reduce((a, e) => a + Math.max(0, (e.capacity ?? 0) - (e.booked ?? 0)), 0);

  // Denominator is sessions that have actually happened - completed +
  // no_show, dated today or earlier - not every booking ever made.
  // Including future "scheduled" sessions in the denominator would dilute
  // the rate with sessions that haven't occurred yet (most of them, on any
  // clinic with a full upcoming calendar), understating how often clients
  // are actually failing to show up to past sessions.
  const today = todayDateStr();
  const pastBookings = bookings.filter(b => b.session_date && b.session_date <= today && (b.status === "completed" || b.status === "no_show"));
  const noShowCount = pastBookings.filter(b => b.status === "no_show").length;
  const noShowRate = pastBookings.length ? Math.round(noShowCount / pastBookings.length * 100) : 0;

  const typeBreakdown = Object.entries(
    activeBookings.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Dashboard</h2>
        <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>Overview of your scheduling activity</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Total sessions" value={activeBookings.length} sub="across all calendars" accent="#378ADD" />
        <StatCard label="Active clients" value={clients.filter(c => c.status === "active").length} sub={`${clients.filter(c => c.status === "waitlist").length} waitlisted`} accent="#5DCAA5" />
        <StatCard label="Staff utilization" value={`${utilizationPct}%`} sub="across clinicians" accent="#EF9F27" />
        <StatCard label="Open slots" value={openSlots} sub="available this week" accent="#D4537E" />
        <StatCard label="No-show rate" value={`${noShowRate}%`} sub={pastBookings.length ? `${noShowCount} of ${pastBookings.length} past sessions` : "no past sessions yet"} accent="#8A5A1E" />
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
          {filterClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                // A clinician sees a colleague's session as its type and
                // time, not who it is with (../lib/sessionPrivacy) - and a
                // masked row carries no client to navigate to, so the name
                // is plain text rather than a dead link. Admin and scheduler
                // are unchanged. Initials re-identify in a clinic this size,
                // so a masked avatar gets a neutral glyph, not "CP".
                const { client, masked } = visibleClient(appUser, b, clients);
                const emp = employees.find(e => e.id === b.employee_id);
                const color = typeColors[b.type] || "#888888";
                const bDay = b.session_date ? dayFromDate(b.session_date) : "—";
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                    <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <Avatar name={masked ? "·" : (client?.name || "?")} size={32} color={color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <PersonLink
                          name={masked ? MASKED_CLIENT_LABEL : client?.name}
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
              {clinicians.length === 0 && (
                <div style={{ fontSize: 13, color: COLORS.textT }}>
                  No one has a clinical credential or a session capacity set yet — add either on the Staff screen and they'll appear here.
                </div>
              )}
              {clinicians.map(e => {
                const pct = utilization(e);
                const color = pct > 0.85 ? "#E24B4A" : pct > 0.6 ? "#EF9F27" : "#5DCAA5";
                return (
                  <div key={e.id} style={{ padding: "10px 14px", borderRadius: 8, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      {/* Was inert text while the client names beside it were
                          already PersonLinks - and this is the list someone
                          actually clicks to ask "what is this person up to". */}
                      <PersonLink name={e.name} onClick={() => onFocusPerson({ employeeId: e.id, label: e.name })} />
                      <span style={{ fontSize: 13, color: COLORS.textS }}>{e.booked ?? 0}/{e.capacity ?? 0}</span>
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

// Formats a plain "YYYY-MM-DD" session_date for display - deliberately not
// reusing dateUtils' calendar-grid formatters, which are built around a Date
// object with a time component; this only ever gets a date-only string.
function formatSessionDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// "Needs attention" leaderboard - see ClientsView's own comment above where
// this is called for the full reasoning on what "last session" means here.
function NeedsAttentionPanel({ clients, bookings, staleAfterDays, onNavigate }) {
  // ── Why "last session" means max(session_date) where status != 'cancelled',
  // NOT "last completed session" ──────────────────────────────────────────
  // Nothing in this app ever sets sessions.status = 'completed' anywhere in
  // its code (confirmed during the no-show-tracking phase of this same
  // batch) - a session sits at 'scheduled' forever once its date passes, or
  // moves to 'cancelled'/'no_show'. "Last completed session" would therefore
  // show every active client as having zero completed sessions ever, which
  // is useless as a staleness signal. Using the most recent non-cancelled
  // session_date instead - whether it's in the past (they haven't been seen
  // in a while) or the future (they have an upcoming session, so they are
  // NOT stale) - is a deliberate workaround for that missing lifecycle, not
  // an oversight. A future fix to the 'completed' lifecycle gap (tracked
  // separately, not this task) should let this prefer status = 'completed'
  // and narrow to past dates only; it shouldn't need to be re-derived from
  // scratch when that happens.
  function lastSessionFor(clientId) {
    let best = null;
    for (const b of bookings) {
      if (b.client_id !== clientId || b.status === "cancelled" || !b.session_date) continue;
      if (!best || b.session_date > best.session_date) best = b;
    }
    return best;
  }

  const rows = clients
    .filter(c => c.status === "active")
    .map(c => {
      const last = lastSessionFor(c.id);
      const daysSince = last ? Math.floor((Date.now() - new Date(`${last.session_date}T00:00:00`).getTime()) / 86400000) : null;
      return { client: c, last, daysSince };
    })
    // A client with an upcoming-only last session gets a negative
    // daysSince, which never clears a positive threshold - they're
    // correctly excluded without a separate "is this in the future" check.
    .filter(({ last, daysSince }) => !last || daysSince > staleAfterDays)
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, margin: 0 }}>Needs attention</h3>
        <span style={{ fontSize: 12, color: COLORS.textT }}>
          {rows.length} active client{rows.length !== 1 ? "s" : ""} with no session in the last {staleAfterDays} day{staleAfterDays !== 1 ? "s" : ""} (or never booked)
        </span>
      </div>
      <div style={{ borderRadius: 10, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, overflow: "hidden" }}>
        {rows.map(({ client, last, daysSince }, i) => (
          <div key={client.id} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", flexWrap: "wrap",
            borderTop: i === 0 ? "none" : `0.5px solid ${COLORS.border}`,
          }}>
            <Avatar name={client.name} color="#E24B4A" />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{client.name}</div>
              <div style={{ fontSize: 12, color: COLORS.textT }}>
                {last ? `Last: ${formatSessionDate(last.session_date)} · ${last.type || "Unspecified type"}` : "Never booked"}
              </div>
            </div>
            <Badge
              label={daysSince === null ? "Never booked" : `${daysSince} day${daysSince !== 1 ? "s" : ""} since`}
              color="#E24B4A"
            />
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("create")}
                style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}
              >
                Book a session
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientsView({ clients, locations, clientAvailability, setClientAvailability, workStart, workEnd, workDays, bookings, onNavigate }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = clients.filter(c => JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));
  const appUser = useContext(UserContext);
  // Re-renders whenever the settings-change subscription at the top of
  // Scheduler() fires (see SettingsView's own comment on this same key) -
  // no local subscription needed here for the same reason.
  const staleAfterDays = Number(getSetting("clients.staleAfterDays"));
  const incrementMinutes = Number(getSetting("calendar.gridIncrementMinutes")) || 30;

  async function handleSaveAvailability(clientId, ranges) {
    const scoped = ranges.map(r => ({ ...r, clinic_id: appUser.clinic_id }));
    await supabase.from("client_availability").delete().eq("client_id", clientId);
    if (scoped.length) await supabase.from("client_availability").insert(scoped);
    setClientAvailability(prev => [...prev.filter(a => a.client_id !== clientId), ...scoped]);
    setExpandedId(null);
    // No showToast here: @summit/availability's grid announces its own save
    // (and its own failure) now, which is what made it worth sharing - the
    // two profile pages that use the same grid said nothing before.
  }

  // client.sessions is a stored counter, set to 0 at creation and never
  // incremented or decremented anywhere a session is actually booked or
  // cancelled - it silently drifts from reality (a client could show "11
  // sessions" here while NeedsAttentionPanel, reading the live `bookings`
  // array, correctly tags the same client "Never booked"). Counting
  // non-cancelled bookings live, the same source NeedsAttentionPanel
  // already uses, keeps this in sync instead of adding a second thing that
  // has to remember to update the stored counter.
  function sessionsCountFor(clientId) {
    return (bookings || []).filter(b => b.client_id === clientId && b.status !== "cancelled").length;
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

      <NeedsAttentionPanel clients={clients} bookings={bookings || []} staleAfterDays={staleAfterDays} onNavigate={onNavigate} />

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
                <div style={{ fontSize: 13, color: COLORS.textS, minWidth: 70, textAlign: "right" }}>{sessionsCountFor(client.id)} sessions</div>
                <button onClick={() => setExpandedId(isExp ? null : client.id)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: isExp ? COLORS.bgT : COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                  {isExp ? "Close" : "Edit availability"}
                </button>
              </div>
              {isExp && <div style={{ padding: "0 16px 16px" }}>
                <AvailabilityGrid entityId={client.id} entityType="client" existingAvailability={cAvail}
                  onSave={(ranges) => handleSaveAvailability(client.id, ranges)} onCancel={() => setExpandedId(null)}
                  workStart={workStart} workEnd={workEnd} workDays={workDays} incrementMinutes={incrementMinutes} />
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Staff view ───────────────────────────────────────────────────────────────

function EmployeesView({ employees, locations, staffAvailability, setStaffAvailability, typeColors, workStart, workEnd, workDays }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = employees.filter(e => JSON.stringify(e).toLowerCase().includes(search.toLowerCase()));
  const appUser = useContext(UserContext);
  const incrementMinutes = Number(getSetting("calendar.gridIncrementMinutes")) || 30;

  async function handleSaveAvailability(staffId, ranges) {
    const scoped = ranges.map(r => ({ ...r, clinic_id: appUser.clinic_id }));
    await supabase.from("staff_availability").delete().eq("staff_id", staffId);
    if (scoped.length) await supabase.from("staff_availability").insert(scoped);
    setStaffAvailability(prev => [...prev.filter(a => a.staff_id !== staffId), ...scoped]);
    setExpandedId(null);
    // See ClientsView's copy of this handler - the grid toasts for itself.
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
          // Every row stays listed - this is the roster, and a row nobody can
          // see is a row nobody can give a credential to or delete. Only the
          // capacity METER is clinician-scoped, since a booking capacity on
          // someone who is never booked is a number with no meaning (and,
          // before utilization() guarded the division, a NaN-width bar).
          const showCapacity = isClinicalStaff(emp);
          const pct = utilization(emp);
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
                  {showCapacity ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textS, marginBottom: 5 }}>
                        <span>Capacity</span><span>{emp.booked ?? 0}/{emp.capacity ?? 0}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 4, background: COLORS.border }}>
                        <div style={{ height: "100%", borderRadius: 4, background: barColor, width: `${Math.round(pct * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: COLORS.textT }}>No credential or capacity set</div>
                  )}
                </div>
                <button onClick={() => setExpandedId(isExp ? null : emp.id)} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: isExp ? COLORS.bgT : COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                  {isExp ? "Close" : "Edit availability"}
                </button>
              </div>
              {isExp && <div style={{ padding: "0 16px 16px" }}>
                <AvailabilityGrid entityId={emp.id} entityType="staff" existingAvailability={empAvail}
                  onSave={(ranges) => handleSaveAvailability(emp.id, ranges)} onCancel={() => setExpandedId(null)}
                  workStart={workStart} workEnd={workEnd} workDays={workDays} incrementMinutes={incrementMinutes} />
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
                  // Iconography over typography: a struck-through eye beside
                  // the client glyph, rather than the words "No client". The
                  // title carries the wording for anyone who needs it, and
                  // aria-label keeps it announced rather than silent.
                  <span
                    title="No client attached to this session type"
                    aria-label="No client attached to this session type"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: COLORS.bgT, color: COLORS.textS, border: `1px solid ${COLORS.border}` }}
                  >
                    <Icon name="hidden" size={13} />
                    <Icon name="client" size={13} />
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

// ─── Locations view ───────────────────────────────────────────────────────────

/**
 * Locations had no management screen at all until now: `locations` was read
 * by the calendar, the matcher, the admin forms and the ICS feeds, and
 * written by nothing. The only way a clinic could have one was a seed script
 * or a hand-run INSERT.
 *
 * That is not cosmetic. Staff-to-client matching is gated on the two sharing
 * a location_id (see quickSlot's eligibleStaff and the wizard's staff step),
 * so a clinic with no locations - or with people whose location_id is null,
 * which was every person created before location became settable - can never
 * match anyone to anyone. "No available staff" with no explanation is what
 * that looks like from the outside.
 *
 * Admin-only, matching the RLS: 0013 grants insert/update/delete on
 * `locations` to admin alone, so offering these controls to a scheduler
 * would produce writes that silently affect zero rows (CLAUDE.md's "RLS
 * returns empty sets, not errors", on the write side).
 */
function LocationsView({ locations, setLocations, clients, employees, showToast }) {
  const appUser = useContext(UserContext);
  const isAdmin = appUser?.role === "admin";
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!draft?.name?.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    const payload = {
      name: draft.name.trim(),
      address: draft.address?.trim() || null,
      clinic_id: appUser.clinic_id,
    };
    const res = draft.id
      ? await supabase.from("locations").update(payload).eq("id", draft.id).select().single()
      : await supabase.from("locations").insert([payload]).select().single();
    setSaving(false);
    if (res.error || !res.data) { setError(res.error?.message || "Could not save."); return; }
    setLocations(prev => draft.id ? prev.map(l => l.id === res.data.id ? res.data : l) : [...prev, res.data]);
    setDraft(null);
    showToast(draft.id ? "Location saved" : "Location added");
  }

  async function remove(loc) {
    // clients.location_id and staff.location_id are plain references with no
    // cascade, so Postgres refuses the delete while anyone still points at
    // this location - and Supabase surfaces that as a bare foreign-key
    // message. Counting first turns it into a sentence someone can act on.
    const attachedClients = (clients || []).filter(c => c.location_id === loc.id).length;
    const attachedStaff = (employees || []).filter(e => e.location_id === loc.id).length;
    if (attachedClients || attachedStaff) {
      setError(`${loc.name} still has ${attachedClients} client${attachedClients === 1 ? "" : "s"} and ${attachedStaff} staff member${attachedStaff === 1 ? "" : "s"} assigned. Move them to another location first.`);
      return;
    }
    if (!confirm(`Delete ${loc.name}? This cannot be undone.`)) return;
    const { error: delErr } = await supabase.from("locations").delete().eq("id", loc.id);
    if (delErr) { setError(delErr.message); return; }
    setLocations(prev => prev.filter(l => l.id !== loc.id));
    showToast("Location deleted");
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Locations</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>
            Where sessions happen. Staff and clients are matched within a location, so everyone needs one set.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => { setError(null); setDraft({ name: "", address: "" }); }}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", background: "#5DCAA5", color: "#fff", cursor: "pointer" }}>
            + New location
          </button>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: "12px 16px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", color: "#A32D2D", fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {locations.length === 0 && !draft && (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
          {isAdmin
            ? "No locations yet. Add one before assigning staff and clients."
            : "No locations set up yet — an admin can add them."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locations.map(loc => {
          const clientCount = (clients || []).filter(c => c.location_id === loc.id).length;
          const staffCount = (employees || []).filter(e => e.location_id === loc.id).length;
          return (
            <div key={loc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{loc.name}</div>
                <div style={{ fontSize: 13, color: COLORS.textS }}>{loc.address || "No address"}</div>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textS }}>
                {staffCount} staff · {clientCount} client{clientCount === 1 ? "" : "s"}
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setError(null); setDraft(loc); }}
                    style={{ padding: "5px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
                    Edit
                  </button>
                  <button onClick={() => remove(loc)} aria-label={`Delete ${loc.name}`}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: "#A32D2D", cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {draft && (
        <div style={{ marginTop: 16, padding: "18px 20px", borderRadius: 12, background: COLORS.bgS, border: `0.5px solid ${COLORS.borderS}`, display: "grid", gap: 10, maxWidth: 440 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{draft.id ? "Edit location" : "New location"}</div>
          <input autoFocus placeholder="Name (e.g. Oshawa)" value={draft.name || ""}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.text, fontSize: 14 }} />
          <input placeholder="Address (optional)" value={draft.address || ""}
            onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.text, fontSize: 14 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: "9px 20px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: saving ? "progress" : "pointer", fontSize: 14, fontWeight: 500 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setDraft(null); setError(null); }}
              style={{ padding: "9px 16px", borderRadius: 8, background: COLORS.bg, color: COLORS.textS, border: `0.5px solid ${COLORS.border}`, cursor: "pointer", fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings view ────────────────────────────────────────────────────────────

function SettingsView({ employees, clients, locations, typeColors, workDays, setWorkDays, workStart, setWorkStart, workEnd, setWorkEnd, showToast }) {
  const [tab, setTab] = useState("general");
  // Not lifted to Scheduler() like workStart/workEnd/workDays are, since
  // nothing else in this app currently reads it - see ClientsView's
  // "Needs attention" leaderboard, the only other consumer, which reads it
  // directly via getSetting() the same way. Re-renders on change via the
  // same top-level onSettingsChange subscription in Scheduler() that
  // already covers workStart/workEnd (any settings change re-renders this
  // whole tree), so no separate subscription is needed here.
  const staleAfterDays = Number(getSetting("clients.staleAfterDays"));
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

          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>CLIENT ENGAGEMENT</div>
          <div style={{ background: COLORS.bgS, borderRadius: 12, padding: "18px 18px", border: `0.5px solid ${COLORS.border}`, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>Flag active clients as stale after</div>
              <div style={{ fontSize: 13, color: COLORS.textS }}>{staleAfterDays} day{staleAfterDays !== 1 ? "s" : ""}</div>
            </div>
            {/* No local toast on change: setSetting announces both outcomes
                itself, and firing a success toast synchronously told a
                non-admin the threshold had saved while the org write was
                being refused and rolled back under them. */}
            <input
              type="range" min={3} max={60} value={staleAfterDays}
              onChange={e => { void setSetting("clients.staleAfterDays", Number(e.target.value), "org").catch(() => {}); }}
              style={{ width: "100%", accentColor: "#5DCAA5" }}
            />
            <div style={{ fontSize: 12, color: COLORS.textT, marginTop: 8 }}>
              Drives the "Needs attention" list on the Clients screen — an active client with no session booked (past or upcoming, excluding cancelled) within this many days shows up there. Clinics differ on what's too long, so this is per-clinic, not a hardcoded rule.
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

          {/* Clinic-wide, admin-managed shared calendar link (calendar_feed_tokens,
              kind='front_desk' - migration 0071). Distinct from "My calendar feed"
              in the Sidebar (CalendarFeedPanel.tsx, kind='personal') - this one
              belongs to no single person and shows every session in the clinic,
              scrubbed to time + session type + location only. Lives here, not in
              the Sidebar, because this tab is already admin-only
              (Sidebar.tsx's roles: ["admin"] on the "settings" nav entry) and the
              API route itself further restricts *generating* a front-desk token
              to admin/scheduler (migration 0071's header). */}
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textT, letterSpacing: "0.06em", marginBottom: 4 }}>CALENDAR FEEDS</div>
          <FrontDeskFeedPanel />
        </div>
      )}
    </div>
  );
}

// ─── Create view ──────────────────────────────────────────────────────────────

function CreateView({ clients, employees, sessionTypes, locations, calendars, setCalendars, staffAvailability, clientAvailability, bookings, refreshBookings, typeColors, showToast, workDays, workStart, workEnd, prefill, onConsumedPrefill, waitlistPrefill, onConsumedWaitlistPrefill }) {
  const appUser = useContext(UserContext);
  const [step, setStep] = useState("calendar");
  const [trail, setTrail] = useState([]);

  // A clinician's booking power is scoped to themselves only (RLS, migration
  // 0046 - an insert whose employee_id isn't their own linked staff row is
  // rejected outright) - so every staff-ASSIGNMENT candidate pool in this
  // wizard (the quickSlot step's Clinician picker, the multi-step wizard's
  // "Staff preference?" step, and both the single- and multi-client AI-match
  // prompts in runMatch below) is narrowed to just that one row, rather than
  // offering a picker - or letting the AI recommend someone - that would
  // just fail at the final insert. `myStaffId` null (never linked yet, see
  // that migration's header) correctly narrows this to an empty list, same
  // as apps/data's caseload feature behaves for the equivalent gap - not a
  // bug. admin/scheduler are unaffected (assignableEmployees === employees).
  //
  // Deliberately NOT applied to the many other `employees.find(...)` lookups
  // elsewhere in this file that resolve an EXISTING session's employee_id
  // back to a name for display (conflict messages, the Sessions list, this
  // wizard's own suggestion cards) - a clinician has full read parity
  // (migration 0046) and needs to see who an existing or conflicting session
  // actually belongs to even when it isn't themselves.
  const isClinicianUser = appUser?.role === "clinician";
  const myStaffId = appUser?.staffId ?? null;
  const assignableEmployees = isClinicianUser
    ? employees.filter(e => e.id === myStaffId)
    : employees;

  // Break, Lunch and Meeting carry session_types.is_client_optional
  // (migration 0019, whose header calls them "clinician-only blocks on the
  // calendar, not client sessions"). Every picker in this wizard books FOR a
  // client, so offering them there presents a staff block as a billable
  // service. Deliberately NOT applied to the Session Types catalogue, the
  // Sessions/calendar type FILTERS, or any duration/gap/colour lookup -
  // filtering those would hide sessions of that type that already exist.
  // The fallback keeps a clinic that has flagged every one of its types from
  // getting a step with no options and no explanation.
  const filteredTypes = sessionTypes.filter(st => !st.is_client_optional);
  const bookableTypes = filteredTypes.length ? filteredTypes : sessionTypes;

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
  // Defaults to "No" (issue #133 item 7) - most bookings through this wizard
  // are one-time, and leaving this unanswered had a second, compounding
  // effect: `ready` below required an explicit choice here before the whole
  // step even showed a "Book session" button, which is a very plausible
  // reading of "I did a dummy click to create and I'm not seeing the
  // listing populate" (item 8) - nothing to populate if the button never
  // appeared and no insert ever ran.
  const [recurring, setRecurring] = useState("no");
  const [endType, setEndType] = useState(null);
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState("");

  // The session type tab is held as an id. It used to be the type's NAME, and
  // every selection keyed off it (`mc.session_type === stName`) had to match
  // that label back against the catalogue - see CLAUDE.md on joining by id.
  const [activeTab, setActiveTab] = useState(null);
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
  // Click-to-create books a client session by default; flipping this books a
  // staff-only block (Break/Lunch/Meeting) against the same slot instead.
  const [blockMode, setBlockMode] = useState(false);
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
    setQuickIsHome(false); setQuickHomeAddress(""); setBlockMode(false);
    setRecurring("no"); setEndType(null); setEndDate(""); setEndCount("");
    setPendingConflict(null);
    setTrail([]);
    setStep("quickSlot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Waitlist's "Book a session" - replicates the calendar's click-to-create
  // popup (same overlay, below in Scheduler()), but pre-seeds client,
  // location and session type instead of a specific date/hour/minute (the
  // waitlist has none of those yet - that's the whole point of this path).
  // Unlike quickSlot (which needs an exact slot already chosen), this jumps
  // into the standard wizard's own "staff" step with calendar/matchCount/
  // location/client/sessionType already answered the same way clicking
  // through each of those steps would have set them - staff and an
  // available time are the only things actually left to pick. Session type
  // defaults to "Assessment" (still changeable) because handleConfirmAndBook
  // already auto-promotes a waitlist client off the list on a booked
  // Assessment session - this path leads straight into that existing
  // behavior rather than around it.
  useEffect(() => {
    if (!waitlistPrefill) return;
    const covering = calendars.find(c => c.status === "active") ?? calendars.find(c => c.status !== "archived") ?? null;
    const location = locations.find(l => l.id === waitlistPrefill.location_id) ?? null;
    const client = clients.find(c => c.id === waitlistPrefill.id) ?? null;
    // Name-matched, and it has to be: "the assessment is the intake visit" is
    // a fact about what the service MEANS and session_types records nothing to
    // key it on. Same gap as the waitlist filter and the auto-promotion below;
    // an is_intake flag on session_types is the one fix for all three.
    const sessionType = bookableTypes.find(st => st.name === "Assessment") ?? bookableTypes[0] ?? null;
    setSelectedCalendar(covering);
    setMatchCount("one");
    setSelectedLocation(location);
    setSelectedClient(client);
    setSelectedSessionType(sessionType);
    setStaffChoice(null);
    setSelectedStaff(null);
    setRecurring("no"); setEndType(null); setEndDate(""); setEndCount("");
    setError(null);
    setTrail([covering?.name, "One match", location?.name, client?.name, sessionType?.name].filter(Boolean));
    setStep("staff");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitlistPrefill]);

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

  /**
   * Turn a match result into the review screen's items.
   *
   * Both branches carry `clientId`, `sessionTypeId` and a `staffId` per match.
   * The multi-client branch used to re-find the client with
   * `clients.find(cl => cl.name === cm.clientName)` having been handed that
   * client's own row moments earlier - two children with the same first and
   * last name (siblings are not the case; same-name unrelated clients are)
   * would book the wrong child, silently, because `.find()` returns the first.
   * `sessionType` stays alongside as the LABEL the cards render.
   */
  function buildReviewItems(res, type, client, sessionType) {
    if (type === "single" || type === "one") {
      return [{
        clientId: client?.id,
        clientName: client?.name,
        sessionTypeId: sessionType?.id ?? null,
        sessionType: sessionType?.name,
        locationId: client?.location_id,
        matches: (res?.matches || []).map((m, i) => ({ ...m, key: `single-${i}` })),
        notes: res?.notes,
        recommendation: res?.recommendation,
      }];
    }
    return (res?.clientMatches || []).map((cm, ci) => ({
      clientId: cm.clientId,
      clientName: cm.clientName,
      sessionTypeId: cm.sessionTypeId ?? null,
      sessionType: cm.sessionTypeName,
      locationId: cm.locationId ?? null,
      matches: (cm.matches || []).map((m, mi) => ({ ...m, key: `multi-${ci}-${mi}` })),
      notes: cm.notes,
    }));
  }

  function handleAccept(key, match, item) {
    const isCurrentlyAccepted = accepted[key] === true;
    if (isCurrentlyAccepted) {
      setAccepted(a => ({ ...a, [key]: undefined }));
      setProposedSessions(prev => prev.filter(p => p.key !== key));
    } else {
      // `match.staffId` is set by both producers below - the local matcher
      // knows the row it picked, and the AI branch resolves the name the model
      // returns against the exact candidate list it was sent. The name lookup
      // is the last resort for a match shape that predates either, and it is
      // scoped to `employees` only because there is nothing better left: two
      // staff with the same name would resolve to whichever comes first.
      const staff = match.staffId != null
        ? employees.find(e => e.id === match.staffId)
        : employees.find(e => e.name === match.staffName);
      const { day, hour, minute } = parseSlot(match.overlappingSlots?.[0]);
      setAccepted(a => ({ ...a, [key]: true }));
      setProposedSessions(prev => {
        const f = prev.filter(p => p.key !== key);
        return [...f, { key, clientId: item.clientId, clientName: item.clientName, staffId: staff?.id, staffName: staff?.name ?? match.staffName, sessionTypeId: item.sessionTypeId ?? null, sessionType: item.sessionType, locationId: item.locationId, day, hour, minute, color: typeColors[item.sessionType] || "#888888" }];
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
              // `type` is derived from this by migration 0085's
              // sessions_apply_session_type trigger. A pre-0085 proposal with
              // no id falls back to the label it carries.
              ...(ps.sessionTypeId != null ? { session_type_id: ps.sessionTypeId } : { type: ps.sessionType }),
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
      if (err) {
        setBooking(false);
        // The fresh pre-check above closes the overwhelming majority of
        // cases, but not a write racing another one within this same round
        // trip - migration 0045's DB constraint is what catches that. See
        // lib/checkSlotConflict.ts's isBookingConflictError.
        setError(isBookingConflictError(err)
          ? "One of these slots was just booked by someone else - please review and try again."
          : "Booking failed. Try again.");
        return;
      }

      // Auto-promote waitlist clients booked for Assessment
      const assessmentClientIds = [...new Set(
        // Name-keyed for the same reason as the multiClient step's waitlist
        // filter: "an assessment promotes a waitlisted child" is a fact about
        // what the service MEANS, and session_types records nothing to key it
        // on. An is_intake flag is the real fix.
        proposedSessions.filter(ps => ps.sessionType === "Assessment").map(ps => ps.clientId)
      )];
      let promoted = 0;
      if (assessmentClientIds.length) {
        // .select("id", {count:"exact",head:true}) after .update() doesn't
        // type-check against the installed @supabase/postgrest-js version
        // (.select() after a mutation only accepts a columns string, not an
        // options object) and the options object was silently ignored at
        // runtime too - count was always null here. Plain .select("id")
        // returns the updated rows themselves; counting the array is the
        // same information without relying on a signature this version
        // doesn't support. Found while building the Waitlist view
        // (2026-09-14), fixed here since it's the same auto-promotion path.
        const { data: promotedRows } = await supabase
          .from("clients")
          .update({ status: "active" })
          .in("id", assessmentClientIds)
          .eq("status", "waitlist")
          .select("id");
        promoted = promotedRows?.length || 0;
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
        // null for a staff block - the whole point of Break/Lunch/Meeting.
        // Requires migration 0078; before it, 0016's trigger rejected this.
        client_id: blockMode ? null : quickClient.id,
        employee_id: staff.id,
        hour, minute,
        session_date: dateStr,
        // The pointer, not the label: migration 0085's trigger writes `type`
        // from it, so a later rename of this session type cannot detach this
        // row from its own duration, colour and billing rate.
        session_type_id: quickType.id,
        calendar_id: selectedCalendar.id,
        status: "scheduled",
        clinic_id: appUser.clinic_id,
        location_id: quickIsHome ? null : (staff.location_id ?? null),
        is_home_visit: quickIsHome,
        home_address: quickIsHome ? (quickHomeAddress || null) : null,
      });
      if (err) {
        setBooking(false);
        // Same reasoning as handleConfirmAndBook above - migration 0045's DB
        // constraint is the backstop for a write that races another one
        // within this same round trip, past the fresh pre-check above.
        setError(isBookingConflictError(err)
          ? "That slot was just booked by someone else - pick another time."
          : "Booking failed. Try again.");
        return;
      }
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
    // blockMode has no client by design, so it is the one path here that may
    // proceed without one.
    if (!selectedCalendar || (!blockMode && !quickClient) || !quickStaff || !quickType || !prefill) return;
    const quickClientId = blockMode ? null : quickClient.id;

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
              recurrence_id: recurrenceId, client_id: quickClientId, employee_id: quickStaff.id,
              hour: prefill.hour, minute: prefill.minute, session_date: date, session_type_id: quickType.id,
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
            if (b.employee_id !== quickStaff.id && (quickClientId == null || b.client_id !== quickClientId)) return false;
            const bType = findSessionType(b, sessionTypes);
            return gapsOverlap(
              { sessionDate: b.session_date, employeeId: quickStaff.id, clientId: quickClientId, startMinutes: prefill.hour * 60 + prefill.minute, durationMinutes: candDuration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
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
        if (err) {
          setBooking(false);
          // Same reasoning as handleConfirmAndBook/insertQuickSlot above -
          // migration 0045's DB constraint is the backstop past the fresh
          // pre-check for a write that races another one within this same
          // round trip.
          setError(isBookingConflictError(err)
            ? "One of these dates was just booked by someone else - please review and try again."
            : "Booking failed. Try again.");
          return;
        }

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
      if (b.employee_id !== quickStaff.id && (quickClientId == null || b.client_id !== quickClientId)) return false;
      const bType = findSessionType(b, sessionTypes);
      return gapsOverlap(
        { sessionDate: prefill.dateStr, employeeId: quickStaff.id, clientId: quickClientId, startMinutes: prefill.hour * 60 + prefill.minute, durationMinutes: duration, gapBeforeMinutes: gapBefore, gapAfterMinutes: gapAfter },
        { sessionDate: b.session_date, employeeId: b.employee_id, clientId: b.client_id, startMinutes: b.hour * 60 + b.minute, durationMinutes: bType?.duration_minutes ?? bType?.duration ?? 60, gapBeforeMinutes: bType?.gap_before_minutes ?? 0, gapAfterMinutes: bType?.gap_after_minutes ?? 0 },
      );
    }) : null;

    const other = exactConflict || gapHit;
    if (!other) {
      await insertQuickSlot({ dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute, staff: quickStaff });
      return;
    }

    // Masked only where it is actually somebody else's: both finders above
    // match on the SAME employee or the SAME client, so for a clinician the
    // blocking session is usually their own and naming the client there is
    // the whole value of the message. visibleClient() decides per session
    // rather than per role for exactly that reason.
    const otherView = visibleClient(appUser, other, clients);
    const otherLabel = otherView.masked ? MASKED_CLIENT_LABEL : otherView.client?.name;
    const message = exactConflict
      ? `${quickStaff.name} already has a session with ${otherLabel || "another client"} at that time.`
      : `This lands inside the buffer time around ${otherLabel || "another session"}'s ${other.type}.`;
    const existing = bookings.filter(b => b.status !== "cancelled").map(b => {
      const t = findSessionType(b, sessionTypes);
      return { id: b.id, employee_id: b.employee_id, session_date: b.session_date, hour: b.hour, minute: b.minute, durationMinutes: t?.duration_minutes ?? t?.duration ?? 60, status: b.status };
    });
    const incrementMinutes = quickType.grid_increment_minutes ?? (Number(getSetting("calendar.gridIncrementMinutes")) || 15);
    const sameClinician = suggestSameClinicianOtherTime({
      employeeId: quickStaff.id, employeeName: quickStaff.name, dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute,
      durationMinutes: duration, sessions: existing, staffAvailability,
      workStartHour: parseTimeSetting(String(getSetting("calendar.workStart"))), workEndHour: parseTimeSetting(String(getSetting("calendar.workEnd"))),
      incrementMinutes,
    });
    // assignableEmployees, not employees: suggesting a DIFFERENT clinician's
    // open slot is meaningless for a clinician user (they cannot book it) -
    // excludeEmployeeId already removes quickStaff itself, so this
    // naturally comes back empty for a clinician (assignableEmployees is at
    // most just quickStaff) rather than recommending a colleague they'd
    // then be unable to act on.
    const differentClinician = suggestDifferentClinicianSameSlot({
      dateStr: prefill.dateStr, hour: prefill.hour, minute: prefill.minute, durationMinutes: duration,
      locationId: quickStaff.location_id ?? null, excludeEmployeeId: quickStaff.id,
      employees: assignableEmployees, sessions: existing, staffAvailability,
    });
    setPendingConflict({ message, suggestions: [...sameClinician, ...differentClinician] });
  }

  async function runMatch(type) {
    setLoading(true); setError(null);
    let prompt, maxTokens;
    // The exact candidate rows the model is shown. The model answers with a
    // staff NAME - that is the response shape, and there is no id in it - so
    // the answer is resolved against THIS list rather than against the whole
    // roster: it is the set the question was asked about, and anyone outside
    // it was already filtered out for capacity or location. Two colleagues
    // sharing a name inside one candidate list is the residual, and it is
    // reported rather than guessed at.
    let candidates = [];

    if (type === "single" || type === "one") {
      // assignableEmployees, not employees: the AI's candidate pool can
      // never include anyone but the signed-in clinician's own staff row
      // (or nobody, if unlinked) - it would otherwise recommend a colleague
      // for a clinician to book, which the final insert rejects outright.
      const eligible = assignableEmployees.filter(e =>
        hasOpenCapacity(e) &&
        e.location_id === selectedClient.location_id &&
        (staffChoice === "any" || e.id === selectedStaff?.id)
      );
      candidates = eligible;
      const endCond = recurring === "yes" ? (endType === "date" ? `until ${endDate}` : `${endCount} sessions total`) : "one-time";
      // No client identity in this prompt, deliberately. It used to carry
      // `CLIENT: ${selectedClient.name}`, which sent a real client's name to
      // a third-party model on every match - and the name was doing no work:
      // the JSON shape requested below only ever names STAFF back, so nothing
      // downstream reads a client field. What the match actually turns on is
      // the session type, the sessions/week, and the eligible-staff list,
      // which is already filtered to this client's location by `eligible`
      // above. /api/match refuses a prompt that carries an identity field, so
      // re-adding one here fails the request rather than leaking quietly.
      prompt = `You are an ABA scheduling assistant. Find the best staff match for a client.
CALENDAR: ${selectedCalendar.name} (${selectedCalendar.date_start} to ${selectedCalendar.date_end})
SESSION: ${selectedSessionType.name} (${selectedSessionType.duration}min)
SESSIONS/WEEK: ${sessionsPerWeek} | SCHEDULE: ${recurring === "yes" ? `Recurring — ${endCond}` : "One-time"}
ELIGIBLE STAFF: ${eligible.map(e => `${e.name} (${e.booked}/${e.capacity})`).join(", ") || "none"}
Respond ONLY with valid JSON — no extra text:
{"matches":[{"staffName":"...","overlappingSlots":["Mon 9:00"]}],"recommendation":"..."}`;
      maxTokens = 800;
    } else {
      // Previously scanned the hardcoded module-level AVAIL_DAYS/TIME_SLOTS
      // (Mon-Sat, 7am-8pm, 30-min steps) regardless of this clinic's
      // configured calendar.workDays/workStart/workEnd/gridIncrementMinutes -
      // same gap as PreviewGrid and AvailabilityGrid, fixed the same way.
      const matchDays = AVAIL_DAYS.filter(d => workDays.includes(d));
      const matchTimeSlots = generateTimeSlots(workStart, workEnd, Number(getSetting("calendar.gridIncrementMinutes")) || 30);
      const clientMatches = multiClients.map(({ client, sessionTypeId, sessionTypeName }) => {
        // assignableEmployees, not employees - same reason as the
        // single-client branch above. For a clinician this correctly
        // narrows every client's candidate list to just themselves (or
        // none): the multi-client matcher exists to spread several clients
        // across the roster, which isn't a thing a clinician's own booking
        // power can do, so each client here either matches the clinician's
        // own schedule or comes back with no match, rather than a
        // colleague's slot that would fail to book.
        const eligible = assignableEmployees
          .filter(e =>
            hasOpenCapacity(e) &&
            e.location_id === client.location_id
          )
          // utilization(), not booked/capacity: a capacity of 0 or null made
          // this comparator NaN, which leaves Array.sort's order arbitrary.
          .sort((a, b) => utilization(a) - utilization(b));

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
          return { staffId: emp.id, staffName: emp.name, overlappingSlots };
        });

        // Nothing here goes near a model or a network - this branch builds the
        // matches locally from rows it already holds. It used to emit names
        // only and have buildReviewItems find the same rows again by those
        // names, throwing away ids it had in hand.
        return {
          clientId: client.id,
          clientName: client.name,
          locationId: client.location_id,
          sessionTypeId,
          sessionTypeName,
          matches,
        };
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
      // Attach the staff row the model named, before anything downstream has
      // to guess. An unresolvable or ambiguous name keeps its text and simply
      // carries no id: handleAccept's `!ps.staffId` guard then skips it rather
      // than booking somebody arbitrary.
      if (Array.isArray(result?.matches)) {
        result.matches = result.matches.map((m) => {
          const hits = candidates.filter((e) => e.name === m.staffName);
          return hits.length === 1 ? { ...m, staffId: hits[0].id } : m;
        });
      }
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
    // assignableEmployees, not employees - a clinician's own Clinician
    // picker on this click-to-create step offers only themselves (or
    // nobody, if not yet linked to a staff row), never a colleague who
    // would just fail the insert.
    //
    // hasOpenCapacity is the predicate the wizard's "Staff preference?" step
    // and both AI-match candidate lists already applied and this one alone
    // did not - it filtered on location ONLY. An invite-created admin or
    // scheduler row (null credential, capacity 0, and null location, which
    // matches a client whose location is also unset) was therefore offered
    // here as a bookable clinician, rendered "undefined · /0".
    // A staff block (Break / Lunch / Meeting - session_types
    // .is_client_optional, migration 0019) has no client by definition, so it
    // skips the client step, offers only those types, and is not constrained
    // to a client's location or to a clinician's remaining client capacity -
    // a lunch break is not caseload. Migration 0078 is what makes the insert
    // possible at all: 0016's clinic-consistency trigger used to reject any
    // session with a null client_id, which is why these types existed in the
    // catalogue for months without being bookable from anywhere.
    const blockTypes = sessionTypes.filter(t => t.is_client_optional);
    const eligibleStaff = blockMode
      ? (quickType ? assignableEmployees : [])
      : quickType && quickClient
        ? assignableEmployees.filter(e => hasOpenCapacity(e) && e.location_id === quickClient.location_id)
        : [];
    const allThreeChosen = blockMode
      ? !!(quickType && quickStaff)
      : !!(quickClient && quickType && quickStaff);
    const ready = allThreeChosen && recurring && (recurring === "no" || (endType && (endType === "date" ? endDate : endCount)));

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

        {/* Client / Session type / Clinician all show up together now
            (issue #133 item 6) instead of Session type and Clinician being
            gated behind picking a client first - eligibleStaff's own live
            filtering by client-location + session-type is unchanged, it
            just no longer hides the whole Clinician card while incomplete;
            see its `sub` text below for the in-between state. Once all
            three are answered they collapse into one compact, editable
            summary (item 9) rather than staying expanded. */}
        {selectedCalendar && allThreeChosen && (
          <StepCard question="Selected">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!blockMode && quickClient && (
                <SelectedPill label="Client" value={quickClient.name} onClear={() => { setQuickClient(null); setQuickStaff(null); }} />
              )}
              <SelectedPill label={blockMode ? "Block type" : "Session type"} value={quickType.name} color={quickType.color} onClear={() => { setQuickType(null); setQuickStaff(null); }} />
              <SelectedPill label={blockMode ? "Staff" : "Clinician"} value={quickStaff.name} color="#378ADD" onClear={() => setQuickStaff(null)} />
            </div>
          </StepCard>
        )}

        {selectedCalendar && !allThreeChosen && (
          <>
            {blockTypes.length > 0 && (
              <StepCard question="What are you booking?">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <OptionButton
                    label="Client session" selected={!blockMode}
                    onClick={() => { setBlockMode(false); setQuickType(null); setQuickStaff(null); }}
                  />
                  <OptionButton
                    label="Staff block" sub={blockTypes.map(t => t.name).join(" · ")} selected={blockMode}
                    onClick={() => { setBlockMode(true); setQuickClient(null); setQuickType(null); setQuickStaff(null); setQuickIsHome(false); }}
                  />
                </div>
              </StepCard>
            )}

            {!blockMode && (
              <StepCard question="Client">
                {/* Was a flat wall of pills - unusable once a clinic has more
                    than a handful of clients (issue #133 item 5: "135 people
                    plus for a large clinic"). Reuses the same filterable,
                    alphabetical-by-last-name dropdown FilterPanel.tsx already
                    built for the Clinicians/Clients calendar filters. */}
                <SearchSelectMenu
                  label="client"
                  items={eligibleClients.map(c => ({ id: c.id, name: c.name }))}
                  selectedId={quickClient?.id ?? null}
                  onSelect={(id) => { setQuickClient(eligibleClients.find(c => c.id === id) || null); setQuickStaff(null); }}
                  placeholder="Search clients by name…"
                />
              </StepCard>
            )}

            <StepCard
              question={blockMode ? "Block type" : "Session type"}
              sub={
                blockMode
                  ? undefined
                  : bookableTypes.length ? undefined : "No session types are configured for this clinic yet - add one under Session Types before booking."
              }
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(blockMode ? blockTypes : bookableTypes).map(t => <OptionButton key={t.id} label={t.name} color={t.color} selected={quickType?.id === t.id} onClick={() => { setQuickType(t); setQuickStaff(null); }} />)}
              </div>
            </StepCard>

            <StepCard
              question={blockMode ? "Who is this for?" : "Clinician"}
              sub={
                blockMode
                  ? (!quickType ? "Pick a block type above first." : undefined)
                  : !quickClient || !quickType
                  ? "Pick a client and a session type above to see qualified clinicians here - filtering stays live as you choose either one."
                  : !eligibleStaff.length
                    ? (isClinicianUser && myStaffId == null
                        ? "Your account isn't linked to a staff record yet, so you have nothing to book against - ask an admin to link it (Employee Hub → Settings → Workforce)."
                        : isClinicianUser
                          ? "You aren't qualified for this session type at this client's location, so there's no one to pick here - a clinician can only book their own sessions."
                          : "No clinician at this client's location is qualified for this session type.")
                    : undefined
              }
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {eligibleStaff.map(e => <OptionButton key={e.id} label={e.name} sub={`${e.role || "No credential set"} · ${e.booked ?? 0}/${e.capacity}`} color="#378ADD" selected={quickStaff?.id === e.id} onClick={() => setQuickStaff(e)} />)}
              </div>
            </StepCard>
          </>
        )}

        {/* A staff block has no client, so it has no home to visit - this
            step would otherwise offer "Client's home" with nobody's address
            to fill in. */}
        {selectedCalendar && allThreeChosen && !blockMode && (
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

        {selectedCalendar && allThreeChosen && (
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2.8px)", WebkitBackdropFilter: "blur(2.8px)" }}
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
      <StepCard
        question="Session type?"
        sub={bookableTypes.length ? undefined : "No session types are configured for this clinic yet - add one under Session Types before booking."}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {bookableTypes.map(st => <OptionButton key={st.id} label={st.name} sub={`${st.duration} min · $${st.price}`} selected={selectedSessionType?.id === st.id} color={typeColors[st.name] || "#888888"} onClick={() => { setSelectedSessionType(st); advance("staff", st.name); }} />)}
        </div>
      </StepCard>
    </div>
  );

  if (step === "staff") {
    // assignableEmployees, not employees - same reason as the quickSlot
    // step and runMatch above: a clinician only ever sees themselves here
    // (or nobody, if unlinked), and "Any" degrades to the same thing via
    // runMatch's own assignableEmployees-filtered candidate list rather than
    // silently being able to pick a colleague from this list who'd fail the
    // final insert.
    const eligible = assignableEmployees.filter(e => hasOpenCapacity(e) && e.location_id === selectedClient?.location_id);
    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="Staff preference?">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <OptionButton label="Any" sub="AI selects best match" selected={staffChoice === "any"} onClick={() => { setStaffChoice("any"); setSelectedStaff(null); advance("time", "Any staff"); }} />
            {eligible.map(e => <OptionButton key={e.id} label={e.name} sub={`${e.role || "No credential set"} · ${e.booked ?? 0}/${e.capacity}`} selected={selectedStaff?.id === e.id} color="#378ADD" onClick={() => { setStaffChoice("specific"); setSelectedStaff(e); advance("time", e.name); }} />)}
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
    const currentType = bookableTypes.find(t => t.id === activeTab) ?? bookableTypes[0] ?? null;
    // Waitlisted children are offered for assessments and not for therapy.
    // Still keyed on the name, deliberately: this is a judgement about what
    // "Assessment" MEANS as a service, which no column on session_types
    // records, so there is no id to key it on. Flagged rather than hidden -
    // an is_intake flag on session_types is the real fix.
    const activeClients = currentType?.name === "Assessment"
      ? clients.filter(c => c.status === "active" || c.status === "waitlist")
      : clients.filter(c => c.status === "active");

    const isSelected = (clientId, stId) => multiClients.some(mc => mc.client.id === clientId && mc.sessionTypeId === stId);

    function toggleClient(c, st) {
      if (!st) return;
      if (isSelected(c.id, st.id)) {
        setMultiClients(prev => prev.filter(mc => !(mc.client.id === c.id && mc.sessionTypeId === st.id)));
      } else {
        setMultiClients(prev => [...prev, { client: c, sessionTypeId: st.id, sessionTypeName: st.name, key: `${c.id}-${st.id}-${Date.now()}` }]);
      }
    }

    function selectAll(st) {
      if (!st) return;
      const toAdd = activeClients
        .filter(c => !isSelected(c.id, st.id))
        .map(c => ({ client: c, sessionTypeId: st.id, sessionTypeName: st.name, key: `${c.id}-${st.id}-${Date.now()}` }));
      setMultiClients(prev => [...prev, ...toAdd]);
    }

    function clearAll(st) {
      if (!st) return;
      setMultiClients(prev => prev.filter(mc => mc.sessionTypeId !== st.id));
    }

    const tabCount = (stId) => multiClients.filter(mc => mc.sessionTypeId === stId).length;

    return (
      <div>{PH}<Trail steps={trail} onBack={goBack} />
        <StepCard question="Which clients do you want to match?">
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {bookableTypes.map(st => {
              const count = tabCount(st.id);
              const active = currentType?.id === st.id;
              return (
                <button key={st.id} onClick={() => setActiveTab(st.id)}
                  style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${active ? st.color : COLORS.border}`, background: active ? st.color + "22" : COLORS.bg, color: active ? st.color : COLORS.textS, transition: "all 0.15s" }}>
                  {st.name}{count > 0 ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <button onClick={() => selectAll(currentType)}
              style={{ padding: "4px 14px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
              Select all
            </button>
            <button onClick={() => clearAll(currentType)}
              style={{ padding: "4px 14px", borderRadius: 7, fontSize: 12, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer" }}>
              Clear
            </button>
            <span style={{ fontSize: 13, color: COLORS.textT }}>{activeClients.length} eligible</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {activeClients.map(c => {
              const sel = isSelected(c.id, currentType?.id);
              return (
                <button key={c.id} onClick={() => toggleClient(c, currentType)}
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
    const groupTypeIds = sessionTypes.filter(st => st.max_clients > 1).map(st => st.id);
    const groupTypeNames = sessionTypes.filter(st => st.max_clients > 1).map(st => st.name);
    const isGroupType = (item) => item.sessionTypeId != null
      ? groupTypeIds.includes(item.sessionTypeId)
      : groupTypeNames.includes(item.sessionType);
    const groupBuckets = {};
    const individualItems = [];
    reviewItems.forEach(item => {
      if (isGroupType(item)) {
        const bucket = item.sessionTypeId ?? item.sessionType;
        if (!groupBuckets[bucket]) groupBuckets[bucket] = [];
        groupBuckets[bucket].push(item);
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
            {Object.entries(groupBuckets).map(([bucket, groupItems]) => {
              // `bucket` is the session type's id (Object keys are strings),
              // falling back to its name for an item that has no id.
              const st = sessionTypes.find(t => String(t.id) === bucket) ?? sessionTypes.find(t => t.name === bucket);
              return (
                <GroupSessionCard key={bucket} items={groupItems} sessionTypeName={st?.name ?? groupItems[0]?.sessionType ?? bucket} maxClients={st?.max_clients ?? 3}
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

  // A clinician reaching this view (2026-09-02, migration 0046 +
  // ACCESS.scheduler) sees every session clinic-wide (full read parity) but
  // may only create/reschedule/cancel a session where they themselves are
  // the assigned staff member - RLS enforces this at the database, but the
  // UI still needs to not OFFER an action that will just fail or silently
  // no-op (CLAUDE.md's "RLS returns empty sets, not errors" trap applies to
  // writes too: an UPDATE a policy's USING clause excludes matches zero rows
  // and reports success, not an error). `staffId` is undefined until
  // useUser.ts's employment_records lookup resolves, and stays `null`
  // forever for a clinician whose employment record has no staff_id linked
  // yet (a real, expected state - see migration 0046's header) - both cases
  // correctly deny every write below.
  const myStaffId = appUser?.staffId ?? null;
  function canManageSession(b) {
    if (isAdminOrScheduler) return true;
    if (role === "clinician") return myStaffId != null && b.employee_id === myStaffId;
    return false;
  }
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
  // Was "scheduled" - since there's no "completed" status in this schema
  // yet (a session past its date just stays "scheduled" - see
  // NeedsAttentionPanel's own comment on that same gap), that default only
  // ever excluded cancelled/no_show sessions, but a client or clinic whose
  // sessions carry a status value this dropdown doesn't special-case would
  // see an empty list by default with no visible reason why. "All statuses"
  // is a real option here already - defaulting to it means this list always
  // shows something to filter FROM, rather than starting pre-filtered to a
  // guess.
  const [statusFilter, setStatusFilter] = useState("all");
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
  // This list renders every matching row at once, and `bookings` is the
  // whole clinic's history now that it pages past PostgREST's 1000-row cap -
  // so a real clinic opened Sessions and got thousands of rows, each one an
  // avatar, a checkbox, three buttons and ~20 nodes. "all" stays available
  // because exporting or bulk-cancelling a whole filter is a real thing to
  // want; it is just no longer what you get by default.
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

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
      // Searching a name the viewer isn't shown is the same leak by another
      // route: type a client's name, see which of a colleague's sessions
      // survive. visibleClient() returns no client row at all when masked,
      // so there is nothing here to match on. Staff and type are unchanged -
      // a clinician sees every colleague's name already (migration 0046).
      const { client } = visibleClient(appUser, b, clients);
      const emp = employees.find(e => e.id === b.employee_id);
      const q = search.toLowerCase();
      if (!client?.name?.toLowerCase().includes(q) && !emp?.name?.toLowerCase().includes(q) && !b.type?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    let av, bv;
    if (sortKey === "session_date") { av = `${a.session_date}${a.hour}`; bv = `${b.session_date}${b.hour}`; }
    // Same reasoning as the search above: masked rows sort as one
    // undifferentiated group rather than alphabetically by a hidden name.
    else if (sortKey === "client") { av = visibleClient(appUser, a, clients).client?.name || ""; bv = visibleClient(appUser, b, clients).client?.name || ""; }
    else if (sortKey === "staff") { av = employees.find(e => e.id === a.employee_id)?.name || ""; bv = employees.find(e => e.id === b.employee_id)?.name || ""; }
    else if (sortKey === "location") { av = locations?.find(l => l.id === employees.find(e => e.id === a.employee_id)?.location_id)?.name || ""; bv = locations?.find(l => l.id === employees.find(e => e.id === b.employee_id)?.location_id)?.name || ""; }
    else if (sortKey === "type") { av = a.type || ""; bv = b.type || ""; }
    else if (sortKey === "status") { av = a.status || ""; bv = b.status || ""; }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Any change to what is being listed, or how it is ordered, invalidates
  // the page number - page 7 of a 3-page result is a blank table.
  useEffect(() => { setPage(1); }, [calFilter, statusFilter, typeFilter, staffFilter, search, sortKey, sortDir, perPage]);

  const pageCount = perPage === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  // Clamped rather than trusted: rows can disappear underneath a set page
  // (a refresh after someone else cancels) between the effect above firing.
  const safePage = Math.min(page, pageCount);
  const visible = perPage === "all" ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    // The page, not the whole filter: the header checkbox sits above these
    // rows and "select all" meaning rows you cannot see is how the bulk
    // cancel below became dangerous in the first place.
    const allOnPageSelected = visible.length > 0 && visible.every(b => selected.has(b.id));
    setSelected(prev => {
      const n = new Set(prev);
      for (const b of visible) { if (allOnPageSelected) n.delete(b.id); else n.add(b.id); }
      return n;
    });
  }

  async function cancelSelected() {
    // Intersect with what is actually on screen, the way exportICS below
    // already does. Nothing clears `selected` when a filter changes, so
    // ticking rows, narrowing the filter and pressing Cancel used to cancel
    // sessions the user could no longer see - and cancelling the wrong
    // session is not an error anyone gets to undo.
    const ids = visible.filter(b => selected.has(b.id)).map(b => b.id);
    if (ids.length === 0) return;
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
    // What is on screen, not the whole filter: with the list paginated, an
    // export of rows the user never saw is the same surprise the bulk cancel
    // had. Set the page size to "All" to feed the whole filter to it.
    const toExport = selected.size > 0 ? visible.filter(b => selected.has(b.id)) : visible;
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
      const { client, masked } = visibleClient(appUser, b, clients);
      const emp = employees.find(e => e.id === b.employee_id);
      const st = findSessionType(b, sessionTypes);
      const dur = st?.duration || 60;
      const [y, mo, d] = (b.session_date || "").split("-").map(Number);
      if (!y || !mo || !d) return;
      // b.minute was dropped entirely before (both start and end always
      // computed as if the session began exactly on the hour), so anything
      // on this app's 15/30-minute scheduling grid exported at the wrong
      // start AND end time.
      const start = new Date(y, mo - 1, d, b.hour, b.minute || 0);
      const end = new Date(start.getTime() + dur * 60000);
      // A colleague's session exports as time + type and nothing else -
      // matching the wording lib/ics.ts and the token-backed feed route
      // already emit, and for the same reason: a downloaded file outlives
      // the screen it came from.
      lines.push("BEGIN:VEVENT",
        `DTSTART:${toICSUTC(start)}`,
        `DTEND:${toICSUTC(end)}`,
        `SUMMARY:${masked ? `Busy – ${b.type}` : `${b.type} – ${client?.name || "Client"}`}`,
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
    if (err) {
      // Same reasoning as the other write sites in this file - migration
      // 0045's DB constraint is the backstop for a write that races another
      // one within this same round trip, past the fresh pre-check above.
      setRescheduleError(isBookingConflictError(err)
        ? "That slot was just booked by someone else - pick another time."
        : "Reschedule failed. Please try again.");
      return;
    }
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
          <option value="no_show">No-show</option>
        </select>
        <select value={calFilter} onChange={e => setCalFilter(e.target.value)} style={selInput}>
          <option value="all">All calendars</option>
          {(calendars || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selInput}>
          <option value="all">All types</option>
          {(sessionTypes || []).map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
        </select>
        {/* Read-only filter, so it follows the read-parity rule, not the
            write-scoping one: a clinician sees every staff member's
            sessions clinic-wide (0046), so filtering by staff is exactly as
            safe for them as it is for admin/scheduler. */}
        {(isAdminOrScheduler || role === "clinician") && (
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} style={selInput}>
            <option value="all">All staff</option>
            {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        {(search || statusFilter !== "all" || calFilter !== "all" || typeFilter !== "all" || staffFilter !== "all") && (
          <button onClick={() => { setSearch(""); setStatusFilter("all"); setCalFilter("all"); setTypeFilter("all"); setStaffFilter("all"); }}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textT, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 140px 100px 80px 80px", gap: 0, padding: "6px 12px", borderRadius: "8px 8px 0 0", background: COLORS.bgS, border: `0.5px solid ${COLORS.border}`, borderBottom: "none" }}>
        <input type="checkbox" checked={visible.length > 0 && visible.every(b => selected.has(b.id))} onChange={toggleAll} style={{ cursor: "pointer" }} />
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
        {visible.map((b, i) => {
          // A clinician sees a colleague's session as its type and time, not
          // who it is with (../lib/sessionPrivacy). Admin and scheduler are
          // unchanged. The initials in the avatar re-identify at this
          // clinic's size, so a masked row gets a neutral glyph instead.
          const { client, masked } = visibleClient(appUser, b, clients);
          const emp = employees.find(e => e.id === b.employee_id);
          const col = typeColors[b.type] || "#888";
          const isSel = selected.has(b.id);
          const isCancelled = b.status === "cancelled";
          const isNoShow = b.status === "no_show";
          // Never a future session (no one can know yet that a client
          // didn't show), and only while the session is still "scheduled" -
          // same guard SessionDetail.tsx uses for its own "Mark no-show"
          // button.
          const canMarkNoShow = b.status === "scheduled" && b.session_date && b.session_date <= todayDateStr();
          const now = new Date();
          const sessionTime = b.session_date ? new Date(`${b.session_date}T${String(b.hour).padStart(2, "0")}:00:00`) : null;
          const lateCancel = sessionTime && (sessionTime - now) / 36e5 < CANCEL_HOURS;
          const bDay = b.session_date ? dayFromDate(b.session_date) : "—";
          return (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 140px 100px 80px 80px", gap: 0, padding: "10px 12px", borderBottom: i < filtered.length - 1 ? `0.5px solid ${COLORS.border}` : "none", background: isSel ? COLORS.bgS : COLORS.bg, opacity: isCancelled ? 0.55 : 1, alignItems: "center", transition: "background 0.1s" }}>
              <input type="checkbox" checked={isSel} onChange={() => toggleSelect(b.id)} style={{ cursor: "pointer" }} />
              <div
                role="button" tabIndex={0} aria-label={`View session details for ${masked ? `a ${b.type} session` : (client?.name || "this session")}`}
                onClick={() => setDetailSession(b)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailSession(b); } }}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              >
                <Avatar name={masked ? "·" : (client?.name || "?")} size={28} color="#378ADD" />
                <span style={{ fontSize: 13, fontWeight: 500, color: masked ? COLORS.textS : COLORS.text }}>{masked ? MASKED_CLIENT_LABEL : (client?.name || "—")}</span>
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
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: isCancelled ? "#88888820" : isNoShow ? "#EF9F2720" : "#5DCAA520", color: isCancelled ? COLORS.textT : isNoShow ? "#8A5A1E" : "#5DCAA5", border: `0.5px solid ${isCancelled ? COLORS.border : isNoShow ? "#EF9F2744" : "#5DCAA544"}` }}>
                  {b.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {/* Both buttons require canManageSession(b), not just
                    isAdminOrScheduler: admin/scheduler still get both on
                    every session (unchanged), and a clinician now gets both
                    but ONLY on a session whose employee_id is their own
                    linked staff row - RLS (migration 0046) enforces the
                    same boundary at the database, this is the UI half so a
                    clinician is never offered an action on a colleague's
                    session that would just silently no-op (an UPDATE a
                    policy's USING clause excludes matches zero rows, not an
                    error - see CLAUDE.md's "RLS returns empty sets, not
                    errors" trap). The previous "Reschedule"/"Propose
                    reschedule" ternary here was unreachable dead code (only
                    admin/scheduler could ever reach this view) and is
                    dropped rather than kept: now that the button only
                    renders when the viewer can actually act, "Propose" never
                    applies - investigated wiring a real propose flow for a
                    clinician viewing a COLLEAGUE's session instead (the
                    session_change_requests table from migration 0040), but
                    that table is family-initiated only (no staff-side
                    insert policy at all) and its staff read/action policies
                    gate on the 'scheduling.session.book' action, which
                    clinician does not hold (0024's seed) - not a trivial
                    reuse, so left out of scope rather than guessed at. */}
                {!isCancelled && canManageSession(b) && (
                  <>
                    {canMarkNoShow && (
                      <button title="Mark no-show" aria-label="Mark session as no-show" onClick={async () => {
                        if (!confirm("Mark this session as a no-show?")) return;
                        const { error: err } = await supabase.from("sessions").update({ status: "no_show" }).eq("id", b.id);
                        refreshBookings();
                        showToast(err ? "Mark no-show failed. Please try again." : "Session marked as no-show");
                      }} style={{ width: 28, height: 28, borderRadius: 7, border: "0.5px solid #F0D5A8", background: COLORS.bg, color: "#8A5A1E", cursor: "pointer", fontSize: 14 }}>⚠</button>
                    )}
                    <button title="Reschedule"
                      aria-label="Reschedule session"
                      onClick={() => { setRescheduleTarget(b); setProposeDay(b.session_date ? dayFromDate(b.session_date) : "Mon"); setProposeHour(b.hour); setProposeDate(b.session_date || ""); setRescheduleError(null); }}
                      style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bg, color: COLORS.textS, cursor: "pointer", fontSize: 14 }}>✎</button>
                    <button title="Cancel" aria-label="Cancel session" onClick={async () => {
                      if (!confirm(lateCancel ? `Within the ${CANCEL_HOURS}-hour window. Cancel anyway?` : "Cancel this session?")) return;
                      const { error: err } = await supabase.from("sessions").update({ status: "cancelled" }).eq("id", b.id);
                      refreshBookings();
                      showToast(err ? "Cancel failed. Please try again." : "Session cancelled");
                    }} style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid #F7C1C1`, background: COLORS.bg, color: "#E24B4A", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pager. Rendered whenever there is anything to list, even on a single
          page, so the page-size control stays in the same place rather than
          appearing only once a clinic grows past it. */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 13, color: COLORS.textS }}>
          <div>
            {perPage === "all"
              ? `Showing all ${filtered.length} session${filtered.length === 1 ? "" : "s"}`
              : `Showing ${(safePage - 1) * perPage + 1}\u2013${Math.min(safePage * perPage, filtered.length)} of ${filtered.length}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: COLORS.textT }}>Per page</span>
              <select
                value={String(perPage)}
                onChange={e => setPerPage(e.target.value === "all" ? "all" : Number(e.target.value))}
                style={{ padding: "5px 8px", borderRadius: 7, border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, cursor: "pointer" }}
              >
                {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n}</option>)}
                <option value="all">All</option>
              </select>
            </label>
            {perPage !== "all" && pageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                  style={{ ...navBtnSmallInline, opacity: safePage <= 1 ? 0.4 : 1, cursor: safePage <= 1 ? "not-allowed" : "pointer" }}
                  aria-label="Previous page">‹</button>
                <span style={{ minWidth: 82, textAlign: "center" }}>Page {safePage} of {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}
                  style={{ ...navBtnSmallInline, opacity: safePage >= pageCount ? 0.4 : 1, cursor: safePage >= pageCount ? "not-allowed" : "pointer" }}
                  aria-label="Next page">›</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleTarget && (() => {
        const client = clients.find(c => c.id === rescheduleTarget.client_id);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2.8px)", WebkitBackdropFilter: "blur(2.8px)" }}>
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
          canManage={canManageSession(detailSession)}
          onClose={() => setDetailSession(null)}
          onReschedule={proposedSlot => { setRescheduleInitialSlot(proposedSlot || null); setReschedulingSession(detailSession); setDetailSession(null); }}
          onCancelled={() => { setDetailSession(null); refreshBookings(); showToast("Session cancelled"); }}
          onNoShow={() => { setDetailSession(null); refreshBookings(); showToast("Session marked as no-show"); }}
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
          lockEmployeeId={role === "clinician"}
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
    const validViews = ["dashboard", "calendar", "sessions", "clients", "waitlist", "employees", "sessiontypes", "locations", "create", "settings"];
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
  // Adapter, not a wrapper worth removing: ~25 call sites below already read
  // well as showToast(...), and keeping the name means collapsing onto
  // @summit/toast is a one-line change here rather than 25 elsewhere.
  function showToast(message = "Changes saved") { toast(message); }
  // Set when loadData() came back with at least one failed query. Without
  // this, supabase-js's resolve-on-failure ({data: null, error}) makes a
  // rejected query indistinguishable on screen from an empty table - which
  // is exactly why "the sessions list is blank" could not be diagnosed.
  const [loadFailed, setLoadFailed] = useState(false);

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
    // .catch here and below for the same reason as the stale-client slider:
    // org writes are admin-only, so a refused write must not surface as an
    // unhandled rejection. setSetting has already toasted the failure.
    void setSetting("calendar.workDays", next.join(","), "org").catch(() => {});
  }
  function setWorkStart(hour) { void setSetting("calendar.workStart", `${String(hour).padStart(2, "0")}:00`, "org").catch(() => {}); }
  function setWorkEnd(hour) { void setSetting("calendar.workEnd", `${String(hour).padStart(2, "0")}:00`, "org").catch(() => {}); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [c, e, st, b, l, cal, sa, ca] = await Promise.all([
      fetchAllRows(() => supabase.from("clients").select("*")),
      fetchAllRows(() => supabase.from("staff").select("*")),
      fetchAllRows(() => supabase.from("session_types").select("*")),
      // `sessions_visible()`, not the `sessions` table - migration 0077.
      // Unwindowed on purpose (both date args default null): this list backs
      // the Sessions tab, the dashboard counts and the Create wizard's
      // conflict pre-check, none of which are windowed. For admin/scheduler
      // the rows are identical to the table's; for a clinician, colleague
      // rows arrive with client_id and home_address NULL and client_masked
      // set, which is what lib/sessionPrivacy.ts renders from. Unwindowed is
      // not the same as unbounded - see fetchAllRows.
      fetchAllRows(() => supabase.rpc("sessions_visible")),
      fetchAllRows(() => supabase.from("locations").select("*")),
      fetchAllRows(() => supabase.from("calendars").select("*")),
      fetchAllRows(() => supabase.from("staff_availability").select("*")),
      fetchAllRows(() => supabase.from("client_availability").select("*")),
    ]);
    // Every one of these used to be `if (x.data) setX(x.data)`, which reads
    // the success half and throws the failure half away. supabase-js RESOLVES
    // on a PostgREST/auth/network failure with {data: null, error} rather than
    // rejecting, so a failed query left its array at [] with nothing logged,
    // nothing on screen, and no way to tell "the table is empty" from "the
    // query was rejected" - the two things a blank Sessions or Clients list
    // could mean. Naming the table in the log is the point: this is the line
    // the next report gets answered from.
    const results = [
      ["clients", c, setClients], ["staff", e, setEmployees],
      ["session_types", st, setSessionTypes], ["sessions", b, setBookings],
      ["locations", l, setLocations], ["calendars", cal, setCalendars],
      ["staff_availability", sa, setStaffAvailability], ["client_availability", ca, setClientAvailability],
    ];
    let anyFailed = false;
    for (const [table, res, setter] of results) {
      if (res.error) {
        anyFailed = true;
        console.error(`[scheduler] loadData: ${table} query failed`, res.error);
      }
      setter(res.data ?? []);
    }
    setLoadFailed(anyFailed);
  }

  // Deliberately NOT given loadData's `data ?? []` treatment. This runs after
  // a create/cancel/reschedule on already-populated state, so blanking it on
  // a transient error would wipe a correct list AND, because `bookings` is
  // CalendarView's refreshSignal below, kick the calendar into a refetch off
  // the emptied array. Keep the stale-but-correct rows; report the failure.
  async function refreshBookings() {
    const { data, error: err } = await fetchAllRows(() => supabase.rpc("sessions_visible"));
    if (err) {
      console.error("[scheduler] refreshBookings: sessions query failed", err);
      showToast("Couldn't refresh the session list — it may be out of date.");
      return;
    }
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
  // Waitlist's "Book a session" - shares the exact same popup as
  // calendarPrefill below (same overlay, same CreateView instance), just
  // seeded from a waitlist client instead of a calendar click. Kept as its
  // own state rather than reused into calendarPrefill's shape since the two
  // carry different information (a date/hour/minute vs a client/location)
  // and CreateView's two prefill effects key off which one is actually set.
  const [waitlistPrefill, setWaitlistPrefill] = useState(null);
  function closePrefillPopup() { setCalendarPrefill(null); setWaitlistPrefill(null); }
  // Click-to-create's quick-slot wizard modal had no Escape-to-close.
  useEffect(() => {
    if (!calendarPrefill && !waitlistPrefill) return;
    const onKey = e => { if (e.key === "Escape") closePrefillPopup(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendarPrefill, waitlistPrefill]);
  const calendarPrefillTrapRef = useFocusTrap(!!(calendarPrefill || waitlistPrefill));
  function requestCreateAt(dateStr, hour, minute) {
    setCalendarPrefill({ dateStr, hour, minute });
  }
  function requestBookFromWaitlist(client) {
    setWaitlistPrefill(client);
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

  const views = { dashboard: Dashboard, calendar: CalendarView, sessions: SessionsView, clients: ClientsView, waitlist: WaitlistView, employees: EmployeesView, sessiontypes: SessionTypesView, locations: LocationsView, create: CreateView, settings: SettingsView };
  // Sidebar's NAV list controls which LINKS a clinician sees (2026-09-02,
  // migration 0046) - it does not, by itself, stop `?view=employees` (or
  // any of these ids) from being typed straight into the URL, which the
  // effect above (validViews) happily accepts regardless of role. Before
  // this change that never mattered: every other role was already excluded
  // from the whole portal by _app.tsx's ACCESS.scheduler gate. Now that
  // This is the actual enforcement point. `validViews` above accepts any id
  // off `?view=` for every role, so Sidebar's NAV `roles` only ever hid the
  // link - a scheduler typing ?view=settings still got SettingsView and its
  // Admin tab, whose own comment claims the tab is admin-only on the
  // strength of that hidden link. roleAdmitsView reads the same NAV table
  // the sidebar renders from, so the two can no longer disagree; it
  // replaces the clinician-only set that used to live here, which was the
  // exact complement of NAV's clinician entries. Falls back to Dashboard
  // rather than rendering a screen the role has no business seeing.
  const effectiveView = roleAdmitsView(view, appUser?.role) ? view : "dashboard";
  const ViewComp = views[effectiveView];

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
        {loadFailed && (
          <div role="alert" style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1", color: "#A32D2D", fontSize: 14 }}>
            Some scheduling data couldn't be loaded, so lists on this screen may be incomplete or empty. Reload the page — if it keeps happening, the browser console names which table failed.
          </div>
        )}
        <ViewComp
          clients={clients} setClients={setClients}
          employees={employees} setEmployees={setEmployees}
          sessionTypes={sessionTypes} setSessionTypes={setSessionTypes}
          bookings={bookings}
          locations={locations} setLocations={setLocations}
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
          onRequestBookFromWaitlist={requestBookFromWaitlist}
          onNavigate={setView}
          prefill={calendarPrefill}
          onConsumedPrefill={() => setCalendarPrefill(null)}
          onFocusPerson={focusPersonOnCalendar}
          focus={calendarFocus}
          onConsumedFocus={() => setCalendarFocus(null)}
          // CalendarView.tsx keeps its own independently-fetched `sessions`
          // state, so it never noticed a session booked elsewhere (e.g.
          // click-to-create's quickSlot wizard) - see its refreshSignal
          // prop's own doc comment (issue #133 item 8).
          refreshSignal={bookings}
        />
      </main>
      {(calendarPrefill || waitlistPrefill) && (
        <div
          onClick={closePrefillPopup}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            backdropFilter: "blur(2.8px)", WebkitBackdropFilter: "blur(2.8px)",
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
              onClick={closePrefillPopup}
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
              waitlistPrefill={waitlistPrefill}
              onConsumedWaitlistPrefill={() => setWaitlistPrefill(null)}
            />
          </div>
        </div>
      )}
    </div>
    </>
  );
}
