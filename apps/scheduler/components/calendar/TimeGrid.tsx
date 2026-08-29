/**
 * Day / N-day / Week time grid: real date columns, a pixel-per-minute
 * vertical axis bounded by the org's working hours, and duration-proportional
 * session blocks (replacing the old fixed one-row-per-hour grid that only
 * ever matched sessions by weekday name).
 *
 * Density: when `splitEmployeeIds` names a short list (the filter panel's
 * clinician selection, kept small by the caller), each day column gets one
 * sub-column per clinician - genuinely side-by-side, Outlook resource-view
 * style. Otherwise, overlapping sessions in a day column collapse into a
 * single stacked pill spanning their combined time range, with a count and
 * a click-to-expand list - a formalization of the hover-stacking the old
 * grid already did per hour cell, now duration-aware instead of slot-aware.
 */
import * as React from "react";
import { WEEKDAY_ABBR, toDateStr, formatFullRange } from "./dateUtils";
import { LocationPinIcon, HomeIcon, ClinicianIcon, ClientIcon, RecurringIcon, SessionTypeDot } from "./icons";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { sessionDuration } from "./types";

const PX_PER_MIN = 1.1;

interface DragHoverSlot { dateStr: string; hour: number; minute: number }

interface Props {
  days: Date[];
  sessions: CalSession[];
  clients: CalClient[];
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  workStartHour: number;
  workEndHour: number;
  splitEmployeeIds: number[] | null;
  onSlotClick: (dateStr: string, hour: number, minute: number) => void;
  onSessionClick: (session: CalSession) => void;
  onDropSession: (sessionId: number, dateStr: string, hour: number, minute: number) => void;
  /** Pixel budget for the whole time-axis body, measured by the caller from
   *  the actual viewport (see CalendarView) - this is what makes the grid
   *  scale per device instead of always rendering at one fixed px/minute
   *  and relying on scroll to see the rest of the work day. Omit to fall
   *  back to the fixed default (used by nothing today, kept for safety). */
  containerHeight?: number;
  /** How finely a drag or empty-slot click snaps - resolved by the caller
   *  from the currently-dragged session's own type override, or the
   *  personal/org default when nothing is being dragged (see
   *  sessionGridIncrement in types.ts). */
  snapMinutes: number;
  /** How often an hour gridline/label is drawn - calendar.gridlineMinutes. */
  gridlineMinutes: number;
  /** The exact slot a drag is currently hovering over, for the "which hour
   *  and minute am I dropping into" indicator - lifted up to CalendarView so
   *  it can also resolve the active drag's own session-type increment. */
  dragHoverSlot: DragHoverSlot | null;
  onSessionDragStart: (sessionId: number) => void;
  onDragHover: (slot: DragHoverSlot) => void;
  onDragEnd: () => void;
  /** Availability shading while a drag is in progress - the dragged
   *  session's own clinician, so the scheduler can see where dropping is
   *  actually sensible instead of only where the drop will land (that's
   *  dragHoverSlot above, a different thing). No shading when nothing is
   *  being dragged, and no shading for a day with no availability data on
   *  file rather than assuming unavailable. */
  staffAvailability: AvailabilityRow[];
  draggingEmployeeId: number | null;
  /** Sessions belonging to a still-draft calendar, shown only when the
   *  toolbar's "Show drafts" toggle is on (see CalendarView) - rendered
   *  with a dashed border and a small tag rather than looking like a real,
   *  confirmed booking. */
  draftSessionIds: Set<number>;
  /** Today's date string, for the header's today-column highlight. */
  today: string;
}

interface AvailabilityRow { staff_id: number; day: string; start_time: string; end_time: string }

const DRAG_MIME = "application/x-summit-session-id";
const HEADER_ROW_H = 34;
const MIN_PX_PER_MIN = 0.55;

interface Cluster {
  sessions: CalSession[];
  top: number;
  height: number;
}

function minutesFromGridStart(hour: number, minute: number, workStartHour: number): number {
  return (hour + minute / 60 - workStartHour) * 60;
}

function clusterByOverlap(sessions: CalSession[], sessionTypes: CalSessionType[], workStartHour: number, pxPerMin: number): Cluster[] {
  const withRange = sessions
    .map((s) => {
      const start = minutesFromGridStart(s.hour, s.minute, workStartHour);
      const dur = sessionDuration(s, sessionTypes);
      return { s, start, end: start + dur };
    })
    .sort((a, b) => a.start - b.start);

  const clusters: { items: typeof withRange; start: number; end: number }[] = [];
  for (const item of withRange) {
    const last = clusters[clusters.length - 1];
    if (last && item.start < last.end) {
      last.items.push(item);
      last.end = Math.max(last.end, item.end);
    } else {
      clusters.push({ items: [item], start: item.start, end: item.end });
    }
  }
  return clusters.map((c) => ({
    sessions: c.items.map((i) => i.s),
    top: c.start * pxPerMin,
    height: Math.max((c.end - c.start) * pxPerMin, 20),
  }));
}

function locationLabel(
  session: CalSession,
  locations: CalLocation[],
): { icon: React.ReactNode; text: string; title: string } {
  if (session.is_home_visit) {
    const addr = session.home_address || "Home visit";
    return { icon: <HomeIcon size={11} />, text: addr, title: addr };
  }
  const loc = locations.find((l) => l.id === session.location_id);
  return { icon: <LocationPinIcon size={11} />, text: loc?.name || "—", title: loc?.address || loc?.name || "No location set" };
}

function Tooltip({
  session, clients, employees, locations, sessionTypes, typeColors,
}: {
  session: CalSession; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  sessionTypes: CalSessionType[]; typeColors: Record<string, string>;
}) {
  const client = clients.find((c) => c.id === session.client_id);
  const emp = employees.find((e) => e.id === session.employee_id);
  const loc = locationLabel(session, locations);
  const dur = sessionDuration(session, sessionTypes);
  const color = typeColors[session.type] || "#888";
  return (
    <div
      style={{
        position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 80,
        minWidth: 220, background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-secondary)", borderRadius: 10,
        padding: "10px 12px", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--color-text-primary)" }}>
        {formatFullRange(session.session_date, session.hour, session.minute, dur)}
      </div>
      <Row icon={loc.icon} text={loc.text} title={loc.title} />
      <Row icon={<ClinicianIcon size={11} />} text={emp?.name || "Unassigned"} />
      <Row icon={<ClientIcon size={11} />} text={client?.name || "Unknown client"} />
      <Row icon={<SessionTypeDot size={9} color={color} />} text={session.type} />
      {session.recurrence_id && <Row icon={<RecurringIcon size={11} />} text="Recurring" />}
    </div>
  );
}

function Row({ icon, text, title }: { icon: React.ReactNode; text: string; title?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 3 }} title={title}>
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}

/** Only ever puts a bare session id on the wire - the drop target (a
 *  different DayColumn instance, possibly a different day than the one the
 *  drag started in) resolves it against the full session list itself. */
function startDrag(e: React.DragEvent, sessionId: number) {
  e.dataTransfer.setData(DRAG_MIME, String(sessionId));
  e.dataTransfer.effectAllowed = "move";
}

function SessionBlock({
  session, left, width, top, height, color, clients, employees, locations, sessionTypes, typeColors,
  onSessionClick, onDragBegin, onDragEnd, isDraft,
}: {
  session: CalSession; left: string; width: string; top: number; height: number; color: string;
  clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[]; sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  onSessionClick: (s: CalSession) => void;
  onDragBegin: (sessionId: number) => void;
  onDragEnd: () => void;
  isDraft: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  const client = clients.find((c) => c.id === session.client_id);
  const loc = locationLabel(session, locations);
  return (
    <div
      draggable
      onDragStart={(e) => { startDrag(e, session.id); onDragBegin(session.id); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onSessionClick(session); }}
      style={{
        position: "absolute", top, height, left, width, zIndex: 10,
        borderRadius: 5, padding: "2px 5px", background: color + (isDraft ? "14" : "22"),
        border: isDraft ? `1.5px dashed ${color}88` : "none", borderLeft: `2.5px solid ${color}`,
        opacity: isDraft ? 0.75 : 1, cursor: "grab", overflow: "hidden", fontSize: 11.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, color, lineHeight: 1.3 }}>
        {session.recurrence_id && <RecurringIcon size={10} color={color} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client?.name || "Unknown"}</span>
        {isDraft && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color, opacity: 0.8, flexShrink: 0 }}>DRAFT</span>}
      </div>
      {height > 34 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-secondary)", marginTop: 2 }}>
          {loc.icon}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.text}</span>
        </div>
      )}
      {hovered && (
        <Tooltip session={session} clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes} typeColors={typeColors} />
      )}
    </div>
  );
}

function StackedPill({
  cluster, clients, employees, locations, sessionTypes, typeColors, onSessionClick, onDragBegin, onDragEnd, draftSessionIds,
}: {
  cluster: Cluster; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  sessionTypes: CalSessionType[]; typeColors: Record<string, string>;
  onSessionClick: (s: CalSession) => void;
  onDragBegin: (sessionId: number) => void;
  onDragEnd: () => void;
  draftSessionIds: Set<number>;
}) {
  const [open, setOpen] = React.useState(false);
  if (cluster.sessions.length === 1) {
    const s = cluster.sessions[0];
    const color = typeColors[s.type] || "#888";
    return (
      <SessionBlock
        session={s} left="2px" width="calc(100% - 4px)" top={cluster.top} height={cluster.height} color={color}
        clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes} typeColors={typeColors}
        onSessionClick={onSessionClick} onDragBegin={onDragBegin} onDragEnd={onDragEnd} isDraft={draftSessionIds.has(s.id)}
      />
    );
  }
  const first = cluster.sessions[0];
  const color = typeColors[first.type] || "#888";
  return (
    <div
      // Draggable on the collapsed pill itself (moves the first session in
      // it) so a 2+ session slot isn't reschedulable only after opening the
      // list below - a plain click still opens the list untouched, since a
      // completed non-dragging click and a dragstart gesture are mutually
      // exclusive per interaction.
      draggable
      onDragStart={(e) => { startDrag(e, first.id); onDragBegin(first.id); }}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      style={{
        position: "absolute", top: cluster.top, height: cluster.height, left: 2, right: 2, zIndex: 10,
        borderRadius: 5, padding: "2px 5px", background: color + "22", borderLeft: `2.5px solid ${color}`,
        cursor: "grab", overflow: "visible", fontSize: 11.5,
      }}
    >
      <div style={{ fontWeight: 600, color, lineHeight: 1.3 }}>{cluster.sessions.length} sessions</div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 90, minWidth: 200,
          background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 10, padding: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        }}>
          {cluster.sessions.map((s) => {
            const client = clients.find((c) => c.id === s.client_id);
            const c = typeColors[s.type] || "#888";
            const draft = draftSessionIds.has(s.id);
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => { e.stopPropagation(); startDrag(e, s.id); onDragBegin(s.id); }}
                onDragEnd={onDragEnd}
                onClick={(e) => { e.stopPropagation(); onSessionClick(s); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 6, cursor: "pointer", opacity: draft ? 0.7 : 1 }}
              >
                <SessionTypeDot size={8} color={c} />
                {s.recurrence_id && <RecurringIcon size={10} />}
                <span style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{client?.name}</span>
                {draft && <span style={{ fontSize: 9, fontWeight: 700, color: c }}>DRAFT</span>}
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: "auto" }}>
                  {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayColumn({
  date, sessions, clients, employees, locations, sessionTypes, typeColors, workStartHour, workEndHour, pxPerMin,
  snapMinutes, dragHoverSlot, splitEmployeeIds, onSlotClick, onSessionClick, onDropSession,
  onSessionDragStart, onDragHover, onDragEnd, staffAvailability, draggingEmployeeId, draftSessionIds, isToday,
}: {
  date: Date; sessions: CalSession[]; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  sessionTypes: CalSessionType[]; typeColors: Record<string, string>; workStartHour: number; workEndHour: number; pxPerMin: number;
  snapMinutes: number; dragHoverSlot: DragHoverSlot | null;
  splitEmployeeIds: number[] | null;
  onSlotClick: (dateStr: string, hour: number, minute: number) => void;
  onSessionClick: (s: CalSession) => void;
  onDropSession: (sessionId: number, dateStr: string, hour: number, minute: number) => void;
  onSessionDragStart: (sessionId: number) => void;
  onDragHover: (slot: DragHoverSlot) => void;
  onDragEnd: () => void;
  staffAvailability: AvailabilityRow[];
  draggingEmployeeId: number | null;
  draftSessionIds: Set<number>;
  isToday: boolean;
}) {
  const colRef = React.useRef<HTMLDivElement>(null);
  const dateStr = toDateStr(date);

  function timeFromY(clientY: number): { hour: number; minute: number } {
    const rect = colRef.current!.getBoundingClientRect();
    const rawMin = (clientY - rect.top) / pxPerMin;
    const snapped = Math.round(rawMin / snapMinutes) * snapMinutes;
    const totalMin = workStartHour * 60 + Math.max(0, snapped);
    return { hour: Math.floor(totalMin / 60), minute: totalMin % 60 };
  }

  // No target-vs-currentTarget guard: every session block and stacked-pill
  // click handler already calls stopPropagation, so a click only ever
  // reaches here when it landed on genuinely empty space - including inside
  // the per-employee sub-column wrapper div in split mode, which fully
  // covers this column and would otherwise make e.target that wrapper, not
  // this element, and silently swallow every empty-slot click. (Confirmed:
  // that guard meant onSlotClick never fired at all - click-to-create was
  // dead on arrival until this fix.)
  function handleColClick(e: React.MouseEvent) {
    const { hour, minute } = timeFromY(e.clientY);
    onSlotClick(dateStr, hour, minute);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    const { hour, minute } = timeFromY(e.clientY);
    onDragHover({ dateStr, hour, minute });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const { hour, minute } = timeFromY(e.clientY);
    onDropSession(Number(raw), dateStr, hour, minute);
  }

  const height = (workEndHour - workStartHour) * 60 * pxPerMin;

  const columns: { employeeId: number | null; sessions: CalSession[] }[] = splitEmployeeIds
    ? splitEmployeeIds.map((id) => ({ employeeId: id, sessions: sessions.filter((s) => s.employee_id === id) }))
    : [{ employeeId: null, sessions }];

  const hoverTop = dragHoverSlot?.dateStr === dateStr
    ? minutesFromGridStart(dragHoverSlot.hour, dragHoverSlot.minute, workStartHour) * pxPerMin
    : null;

  const dayAbbr = WEEKDAY_ABBR[date.getDay()];
  const availabilityBands = draggingEmployeeId != null
    ? staffAvailability
        .filter((a) => a.staff_id === draggingEmployeeId && a.day === dayAbbr)
        .map((a) => {
          const [sh, sm] = a.start_time.split(":").map(Number);
          const [eh, em] = a.end_time.split(":").map(Number);
          const top = minutesFromGridStart(sh, sm || 0, workStartHour) * pxPerMin;
          const bottom = minutesFromGridStart(eh, em || 0, workStartHour) * pxPerMin;
          return { top: Math.max(top, 0), height: Math.max(bottom - top, 0) };
        })
    : [];

  return (
    <div
      ref={colRef}
      onClick={handleColClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ position: "relative", height, borderLeft: "0.5px solid var(--color-border-tertiary)", display: "flex", background: isToday ? "#5DCAA508" : "transparent" }}
    >
      {availabilityBands.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: b.top, height: b.height, background: "#5DCAA512", borderTop: "1px dashed #5DCAA555", borderBottom: "1px dashed #5DCAA555", zIndex: 1, pointerEvents: "none" }} />
      ))}
      {columns.map((col, i) => {
        const clusters = clusterByOverlap(col.sessions, sessionTypes, workStartHour, pxPerMin);
        return (
          <div key={col.employeeId ?? "all"} style={{ position: "relative", flex: 1, borderLeft: i > 0 ? "0.5px dashed var(--color-border-tertiary)" : "none" }}>
            {clusters.map((cl, idx) => (
              <StackedPill
                key={idx} cluster={cl} clients={clients} employees={employees} locations={locations}
                sessionTypes={sessionTypes} typeColors={typeColors} onSessionClick={onSessionClick}
                onDragBegin={onSessionDragStart} onDragEnd={onDragEnd} draftSessionIds={draftSessionIds}
              />
            ))}
          </div>
        );
      })}
      {hoverTop != null && (
        <div style={{ position: "absolute", left: 0, right: 0, top: hoverTop, zIndex: 30, pointerEvents: "none" }}>
          <div style={{ height: 2, background: "#5DCAA5", boxShadow: "0 0 0 1px rgba(93,202,165,0.5)" }} />
          <div style={{
            position: "absolute", top: -9, right: 4, fontSize: 10.5, fontWeight: 600, color: "#fff",
            background: "#3f9c78", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap",
          }}>
            {String(dragHoverSlot!.hour % 24).padStart(2, "0")}:{String(dragHoverSlot!.minute).padStart(2, "0")}
          </div>
        </div>
      )}
    </div>
  );
}

export function TimeGrid({
  days, sessions, clients, employees, locations, sessionTypes, typeColors,
  workStartHour, workEndHour, splitEmployeeIds, onSlotClick, onSessionClick, onDropSession, containerHeight,
  snapMinutes, gridlineMinutes, dragHoverSlot, onSessionDragStart, onDragHover, onDragEnd,
  staffAvailability, draggingEmployeeId, draftSessionIds, today,
}: Props) {
  const gridlineStepHours = gridlineMinutes / 60;
  const gridlineCount = Math.ceil((workEndHour - workStartHour) / gridlineStepHours) + 1;
  const hourMarks = Array.from({ length: gridlineCount }, (_, i) => workStartHour + i * gridlineStepHours);
  const activeHourMark = dragHoverSlot ? Math.floor(dragHoverSlot.hour / gridlineStepHours) * gridlineStepHours : null;
  const gridCols = splitEmployeeIds ? `52px repeat(${days.length}, minmax(160px, 1fr))` : `52px repeat(${days.length}, minmax(120px, 1fr))`;
  const totalMinutes = (workEndHour - workStartHour) * 60;
  const pxPerMin = containerHeight
    ? Math.max((containerHeight - HEADER_ROW_H) / totalMinutes, MIN_PX_PER_MIN)
    : PX_PER_MIN;
  // pxPerMin can bottom out at MIN_PX_PER_MIN on a short viewport with long
  // working hours - the body then exceeds containerHeight and this wrapper
  // is the one deliberate scroll region left, instead of silently
  // rendering illegibly squashed blocks.
  const bodyHeight = totalMinutes * pxPerMin;
  const needsScroll = bodyHeight > (containerHeight ?? Infinity) - HEADER_ROW_H;

  return (
    <div style={{ overflowX: "auto", overflowY: needsScroll ? "auto" : "visible", height: containerHeight, maxHeight: containerHeight }}>
      <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: 600 }}>
        <div />
        {days.map((d) => {
          const isToday = toDateStr(d) === today;
          return (
            <div
              key={toDateStr(d)}
              style={{
                textAlign: "center", padding: "6px 0", borderBottom: `0.5px solid ${isToday ? "#5DCAA5" : "var(--color-border-tertiary)"}`,
                fontSize: 12.5, fontWeight: isToday ? 600 : 500, color: isToday ? "#3f9c78" : "var(--color-text-secondary)",
                background: isToday ? "#5DCAA50c" : "transparent",
              }}
            >
              {WEEKDAY_ABBR[d.getDay()]}{" "}
              <span style={{ color: isToday ? "#3f9c78" : "var(--color-text-tertiary)" }}>
                {isToday ? <span style={{ display: "inline-flex", width: 18, height: 18, borderRadius: "50%", background: "#5DCAA5", color: "#fff", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{d.getDate()}</span> : d.getDate()}
              </span>
            </div>
          );
        })}
        <div style={{ position: "relative", height: bodyHeight }}>
          {hourMarks.map((h) => {
            const hh = Math.floor(h);
            const mm = Math.round((h - hh) * 60);
            const active = activeHourMark != null && Math.abs(h - activeHourMark) < 0.001;
            return (
              <div
                key={h}
                style={{
                  position: "absolute", top: (h - workStartHour) * 60 * pxPerMin - 6, right: 6,
                  fontSize: 10.5, fontWeight: active ? 700 : 400,
                  color: active ? "#3f9c78" : "var(--color-text-tertiary)",
                }}
              >
                {hh}:{String(mm).padStart(2, "0")}
              </div>
            );
          })}
        </div>
        {days.map((d) => (
          <DayColumn
            key={toDateStr(d)}
            date={d}
            sessions={sessions.filter((s) => s.session_date === toDateStr(d))}
            clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes} typeColors={typeColors}
            workStartHour={workStartHour} workEndHour={workEndHour} pxPerMin={pxPerMin} snapMinutes={snapMinutes}
            dragHoverSlot={dragHoverSlot} splitEmployeeIds={splitEmployeeIds}
            onSlotClick={onSlotClick} onSessionClick={onSessionClick} onDropSession={onDropSession}
            onSessionDragStart={onSessionDragStart} onDragHover={onDragHover} onDragEnd={onDragEnd}
            staffAvailability={staffAvailability} draggingEmployeeId={draggingEmployeeId}
            draftSessionIds={draftSessionIds} isToday={toDateStr(d) === today}
          />
        ))}
      </div>
    </div>
  );
}
