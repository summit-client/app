/**
 * Month view: visibility, not the full time-grid complexity (decided this
 * session - a month is for seeing where the busy/quiet days are, not for
 * reading exact minute-by-minute overlaps). A plain 6-row/42-cell date grid,
 * every day (not just work days), a count badge plus a few compact chips per
 * day, and a "+N more" that expands the rest inline.
 */
import * as React from "react";
import { toDateStr, isSameDate } from "./dateUtils";
import { RecurringIcon, SessionTypeDot } from "./icons";
import type { CalSession, CalClient, CalSessionType } from "./types";

const MAX_CHIPS = 3;

interface Props {
  days: Date[];
  anchorMonth: Date;
  sessions: CalSession[];
  clients: CalClient[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  onSelectDay: (dateStr: string) => void;
  onSessionClick: (s: CalSession) => void;
}

export function MonthGrid({ days, anchorMonth, sessions, clients, sessionTypes, typeColors, onSelectDay, onSessionClick }: Props) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const today = toDateStr(new Date());
  const monthIdx = anchorMonth.getMonth();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} style={{ padding: "6px 0", textAlign: "center", fontSize: 11.5, fontWeight: 600, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          {d}
        </div>
      ))}
      {days.map((d) => {
        const dateStr = toDateStr(d);
        const daySessions = sessions.filter((s) => s.session_date === dateStr);
        const inMonth = d.getMonth() === monthIdx;
        const isToday = dateStr === today;
        const isOpen = expanded === dateStr;
        const chips = isOpen ? daySessions : daySessions.slice(0, MAX_CHIPS);
        const hiddenCount = daySessions.length - chips.length;

        return (
          <div
            key={dateStr}
            style={{
              minHeight: 92, padding: 6, borderRight: "0.5px solid var(--color-border-tertiary)",
              borderBottom: "0.5px solid var(--color-border-tertiary)", background: inMonth ? "var(--color-background-primary)" : "var(--color-background-secondary)",
              opacity: inMonth ? 1 : 0.55, position: "relative",
            }}
          >
            <div
              onClick={() => onSelectDay(dateStr)}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                width: 22, height: 22, borderRadius: "50%", fontSize: 12.5,
                background: isToday ? "#5DCAA5" : "transparent", color: isToday ? "#fff" : "var(--color-text-primary)",
                fontWeight: isToday ? 600 : 400, marginBottom: 4,
              }}
            >
              {d.getDate()}
            </div>
            {daySessions.length > 0 && (
              <div style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginBottom: 3 }}>
                {daySessions.length} session{daySessions.length !== 1 ? "s" : ""}
              </div>
            )}
            {chips.map((s) => {
              const client = clients.find((c) => c.id === s.client_id);
              const color = typeColors[s.type] || "#888";
              return (
                <div
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); onSessionClick(s); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, padding: "1.5px 4px", marginBottom: 2, borderRadius: 4, background: color + "22", cursor: "pointer", overflow: "hidden" }}
                >
                  <SessionTypeDot size={6} color={color} />
                  {s.recurrence_id && <RecurringIcon size={8} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client?.name}</span>
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <div
                onClick={(e) => { e.stopPropagation(); setExpanded(dateStr); }}
                style={{ fontSize: 10.5, color: "#3f9c78", cursor: "pointer" }}
              >
                +{hiddenCount} more
              </div>
            )}
            {isOpen && daySessions.length > MAX_CHIPS && (
              <div
                onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
                style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", cursor: "pointer" }}
              >
                Show less
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
