import * as React from "react";
import { availToSlots, generateTimeSlots, slotsToRanges, type AvailabilityEntityType, type AvailabilityRow } from "./grid";

const AVAIL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface AvailabilityGridProps {
  entityId: number;
  entityType: AvailabilityEntityType;
  existingAvailability: AvailabilityRow[];
  workStart: number;
  workEnd: number;
  workDays: string[];
  /**
   * Org-wide slot granularity - @summit/settings' `calendar.gridIncrementMinutes`.
   * Required rather than defaulted: every caller is expected to read the real
   * setting, not fall back to a guess that could silently drift from it.
   */
  incrementMinutes: number;
  /**
   * Receives the computed ranges (delete-then-insert shape, same as the
   * table's own rows minus clinic_id/id) and does the actual write. Kept out
   * of this component on purpose - three different apps call this with three
   * different Supabase clients and different admin/self-service RLS paths,
   * and this package takes no Supabase dependency, same reasoning as
   * @summit/nav and @summit/portals staying free of one.
   */
  onSave: (ranges: Array<{ staff_id?: number; client_id?: number; day: string; start_time: string; end_time: string }>) => Promise<void>;
  onCancel: () => void;
}

/**
 * Drag-to-select weekly availability grid. Ported out of
 * apps/scheduler/pages/index.jsx (the only place this existed before), which
 * hardcoded 30-minute slots and did its own Supabase write inline - both
 * removed here so every caller (scheduler admin, and the two new self-service
 * profile-page tabs) shares one implementation instead of three copies that
 * can drift.
 */
export function AvailabilityGrid({
  entityId, entityType, existingAvailability, workStart, workEnd, workDays, incrementMinutes, onSave, onCancel,
}: AvailabilityGridProps) {
  const availDays = AVAIL_DAYS.filter((d) => workDays.includes(d));
  const timeSlots = React.useMemo(
    () => generateTimeSlots(workStart, workEnd, incrementMinutes),
    [workStart, workEnd, incrementMinutes],
  );
  const endOfDayTime = `${String(workEnd).padStart(2, "0")}:00`;
  const [selected, setSelected] = React.useState<Set<string>>(() => availToSlots(existingAvailability, timeSlots));
  const [saving, setSaving] = React.useState(false);
  const dragRef = React.useRef<{ active: boolean; mode: "add" | "remove" | null }>({ active: false, mode: null });

  function handleMouseDown(key: string) {
    const mode = selected.has(key) ? "remove" : "add";
    dragRef.current = { active: true, mode };
    setSelected((prev) => { const n = new Set(prev); mode === "remove" ? n.delete(key) : n.add(key); return n; });
  }
  function handleMouseEnter(key: string) {
    if (!dragRef.current.active) return;
    setSelected((prev) => { const n = new Set(prev); dragRef.current.mode === "remove" ? n.delete(key) : n.add(key); return n; });
  }
  function handleMouseUp() { dragRef.current.active = false; }
  // Keyboard equivalent for a plain div grid with no native selection
  // semantics - a single-slot toggle, since drag-range has no keyboard
  // analogue. Carried over from the original; not new to this extraction.
  function handleKeyToggle(e: React.KeyboardEvent, key: string) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function handleSave() {
    setSaving(true);
    const ranges = slotsToRanges(selected, entityId, entityType, availDays, timeSlots, endOfDayTime);
    try {
      await onSave(ranges);
    } finally {
      setSaving(false);
    }
  }

  const slotLabel = incrementMinutes === 60 ? "hour" : `${incrementMinutes}-min`;

  return (
    <div onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      style={{ userSelect: "none", marginTop: 16, padding: 16, borderRadius: 10, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 10 }}>
        Drag to set availability · {selected.size} × {slotLabel} slots
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${availDays.length}, 1fr)`, gap: 2, marginBottom: 4 }}>
        <div />
        {availDays.map((d) => <div key={d} style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${availDays.length}, 1fr)`, gap: 2 }}>
        {timeSlots.map((t) => (
          <React.Fragment key={t}>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "right", paddingRight: 6, height: 14, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {t.endsWith(":00") ? t : ""}
            </div>
            {availDays.map((day) => {
              const key = `${day}-${t}`, on = selected.has(key);
              return (
                <div key={key} onMouseDown={() => handleMouseDown(key)} onMouseEnter={() => handleMouseEnter(key)}
                  role="checkbox" aria-checked={on} aria-label={`${day} ${t}`} tabIndex={0}
                  onKeyDown={(e) => handleKeyToggle(e, key)}
                  style={{ height: 14, borderRadius: 2, cursor: "pointer", background: on ? "#5DCAA5" : "var(--color-background-tertiary)", border: `0.5px solid ${on ? "#5DCAA544" : "var(--color-border-tertiary)"}`, transition: "background 0.05s" }} />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 18px", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          {saving ? "Saving…" : "Save availability"}
        </button>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}
