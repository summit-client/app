/**
 * The multi-select filter dropdown - Locations / Session Types / Clinicians
 * / Clients. Combines as AND across sections, OR within a section (pick two
 * clinicians and you see either of their sessions; add a location filter and
 * you only see sessions matching both). A family of the toggle-pill pattern
 * already used elsewhere in this app (the calendar-term pills this replaces,
 * and PreviewGrid's staff filter), not a new visual language.
 */
import * as React from "react";
import type { CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";

export interface CalendarFilters {
  locationIds: Set<number>;
  typeNames: Set<string>;
  employeeIds: Set<number>;
  clientIds: Set<number>;
}

export function emptyFilters(): CalendarFilters {
  return { locationIds: new Set(), typeNames: new Set(), employeeIds: new Set(), clientIds: new Set() };
}

export function activeFilterCount(f: CalendarFilters): number {
  return f.locationIds.size + f.typeNames.size + f.employeeIds.size + f.clientIds.size;
}

const COLORS = {
  border: "var(--color-border-tertiary)",
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
};

function Section<T extends string | number>({
  title, items, selected, onToggle,
}: {
  title: string;
  items: { id: T; label: string }[];
  selected: Set<T>;
  onToggle: (id: T) => void;
}) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textS, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => {
          const active = selected.has(item.id);
          return (
            <button
              key={String(item.id)}
              onClick={() => onToggle(item.id)}
              style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12.5,
                border: `1px solid ${active ? "#5DCAA5" : COLORS.border}`,
                background: active ? "#5DCAA518" : COLORS.bg,
                color: active ? "#3f9c78" : COLORS.textS,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterPanel({
  locations, sessionTypes, employees, clients, filters, onChange, onClose,
}: {
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  employees: CalEmployee[];
  clients: CalClient[];
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
  onClose: () => void;
}) {
  function toggle<K extends keyof CalendarFilters>(key: K, id: CalendarFilters[K] extends Set<infer T> ? T : never) {
    const next: CalendarFilters = {
      locationIds: new Set(filters.locationIds),
      typeNames: new Set(filters.typeNames),
      employeeIds: new Set(filters.employeeIds),
      clientIds: new Set(filters.clientIds),
    };
    const set = next[key] as Set<unknown>;
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(next);
  }

  return (
    <div
      style={{
        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
        width: 320, maxHeight: 420, overflowY: "auto",
        background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <b style={{ fontSize: 13 }}>Filter</b>
        <button onClick={() => onChange(emptyFilters())} style={{ fontSize: 12, color: COLORS.textS, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Clear all
        </button>
      </div>
      <Section title="Locations" items={locations.map((l) => ({ id: l.id, label: l.name }))} selected={filters.locationIds} onToggle={(id) => toggle("locationIds", id)} />
      <Section title="Session types" items={sessionTypes.map((t) => ({ id: t.name, label: t.name }))} selected={filters.typeNames} onToggle={(id) => toggle("typeNames", id)} />
      <Section title="Clinicians" items={employees.map((e) => ({ id: e.id, label: e.name }))} selected={filters.employeeIds} onToggle={(id) => toggle("employeeIds", id)} />
      <Section title="Clients" items={clients.map((c) => ({ id: c.id, label: c.name }))} selected={filters.clientIds} onToggle={(id) => toggle("clientIds", id)} />
      <button onClick={onClose} style={{ width: "100%", marginTop: 4, padding: "8px 0", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bgS, color: COLORS.text, cursor: "pointer", fontSize: 13 }}>
        Done
      </button>
    </div>
  );
}

export function matchesFilters(
  s: { location_id: number | null; type: string; employee_id: number; client_id: number },
  f: CalendarFilters,
): boolean {
  if (f.locationIds.size && (s.location_id == null || !f.locationIds.has(s.location_id))) return false;
  if (f.typeNames.size && !f.typeNames.has(s.type)) return false;
  if (f.employeeIds.size && !f.employeeIds.has(s.employee_id)) return false;
  if (f.clientIds.size && !f.clientIds.has(s.client_id)) return false;
  return true;
}
