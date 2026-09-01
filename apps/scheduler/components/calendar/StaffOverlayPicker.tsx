/**
 * "Compare schedules": lets any staff role using this portal pick one or
 * more OTHER staff members and see their sessions layered onto the same
 * calendar grid, each person in their own colour - reusing the exact
 * TimeGrid/MonthGrid rendering (SessionBlock/StackedPill/Tooltip/
 * SessionDetail) the viewer's own sessions already use, not a second,
 * redacted renderer. Full session detail is deliberate, not an oversight:
 * `sessions` is already clinic-wide SELECT for every non-client staff role
 * (migrations 0013 + 0014), and `staff` now is too (migration 0035) - anyone
 * who can open this picker could already see this same data one click away
 * via the plain Clinicians filter in FilterPanel.tsx. This only adds a way
 * to see several people's schedules *at once*, distinguishably, which is
 * what the colour + legend below is for.
 *
 * Deliberately excludes the client role at every layer: the client portal
 * (apps/client) doesn't import this component at all, and the RLS this
 * depends on (auth_is_staff() / auth_is_scheduling_staff()) never admits
 * `client` regardless.
 */
import * as React from "react";
import type { CalEmployee } from "./types";

/** Distinct from every colour this app already assigns meaning to -
 *  #5DCAA5 (primary/confirm), #E24B4A (danger/cancel), #378ADD (keyboard
 *  focus), #EF9F27 (draft-calendar warning) - so an overlay colour is never
 *  mistaken for one of those. Session-type colours are set freely per clinic
 *  in Settings and can't be avoided the same way; the legend plus each
 *  block's own tooltip (which always names the person, not just the colour)
 *  is what actually disambiguates a coincidental clash, not the palette. */
export const OVERLAY_PALETTE = [
  "#7C5CFC", // violet
  "#0EA5A5", // teal
  "#D4537E", // rose
  "#C77D2E", // amber
  "#3C6E8F", // steel blue
  "#8E44AD", // purple
  "#2E8B57", // sea green
  "#B5495B", // brick
];

/** Stable for as long as `orderedIds` (the overlay selection, in the order
 *  staff were added) doesn't itself reorder - selecting/deselecting mid-list
 *  can shift a later person's colour, which is an acceptable trade for
 *  keeping this a plain, no-extra-state lookup rather than a colour
 *  assignment table that has to track removal/reuse. */
export function overlayColorFor(staffId: number, orderedIds: number[]): string {
  const idx = orderedIds.indexOf(staffId);
  return OVERLAY_PALETTE[(idx < 0 ? 0 : idx) % OVERLAY_PALETTE.length];
}

function lastNameKey(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return (parts[parts.length - 1] || fullName).toLowerCase();
}

const COLORS = {
  border: "var(--color-border-tertiary)",
  borderS: "var(--color-border-secondary)",
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
  textT: "var(--color-text-tertiary)",
};

export function StaffOverlayPicker({
  employees, selectedIds, onToggle, onClearAll,
}: {
  employees: CalEmployee[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Same close-on-outside-click / close-on-Escape shape as FilterPanel's own
  // menus (not shared code - FilterPanel's useMenu() isn't exported, and
  // duplicating six lines here is cheaper than widening that module's
  // surface for one caller).
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const sorted = React.useMemo(
    () => [...employees].sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name))),
    [employees],
  );
  const filtered = query.trim()
    ? sorted.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;
  const selectedSet = new Set(selectedIds);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "6px 12px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          border: `0.5px solid ${selectedIds.length ? "#7C5CFC" : COLORS.border}`,
          background: selectedIds.length ? "#7C5CFC14" : COLORS.bg,
          color: selectedIds.length ? "#5D3FD3" : COLORS.text, cursor: "pointer",
        }}
      >
        Compare schedules
        {selectedIds.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 15, height: 15, borderRadius: 8, background: "#7C5CFC", color: "#fff", fontSize: 10, padding: "0 4px" }}>
            {selectedIds.length}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60,
            minWidth: 250, maxHeight: 380, overflowY: "auto",
            background: COLORS.bg, border: `0.5px solid ${COLORS.border}`, borderRadius: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 12,
          }}
        >
          <div style={{ fontSize: 11.5, color: COLORS.textT, marginBottom: 8 }}>
            Overlay other staff members&apos; sessions on this calendar, each in their own colour.
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff…"
            style={{ width: "100%", padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: COLORS.textT, padding: "6px" }}>No matches</div>}
            {filtered.map((e) => {
              const active = selectedSet.has(e.id);
              const color = overlayColorFor(e.id, selectedIds);
              return (
                <label
                  key={e.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, fontSize: 13, cursor: "pointer", color: active ? color : COLORS.text, background: active ? color + "14" : "transparent" }}
                >
                  <input type="checkbox" checked={active} onChange={() => onToggle(e.id)} style={{ accentColor: color }} />
                  {active && <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                  {e.name}
                </label>
              );
            })}
          </div>
          {selectedIds.length > 0 && (
            <button
              onClick={(ev) => { ev.stopPropagation(); onClearAll(); }}
              style={{ fontSize: 11.5, color: COLORS.textT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: 8 }}
            >
              Clear overlay
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Colour key, shown once at least one staff member is overlaid - a colour
 *  on the grid needs a name attached to it somewhere the viewer doesn't have
 *  to hover to find, since the grid itself has no other static way to say
 *  "this block is So-and-so's, not mine." Each chip also removes that one
 *  person from the overlay, so this doubles as the "turn it off" control
 *  once the picker menu is closed. */
export function OverlayLegend({
  employees, selectedIds, onRemove,
}: {
  employees: CalEmployee[];
  selectedIds: number[];
  onRemove: (id: number) => void;
}) {
  if (selectedIds.length === 0) return null;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: 8, background: "#7C5CFC0c", border: "0.5px solid #7C5CFC33",
        marginBottom: 12, fontSize: 12.5,
      }}
    >
      <span style={{ color: COLORS.textS, fontWeight: 500 }}>Overlaying:</span>
      {selectedIds.map((id) => {
        const emp = employees.find((e) => e.id === id);
        const color = overlayColorFor(id, selectedIds);
        return (
          <span
            key={id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 6px 2px 8px",
              borderRadius: 20, background: color + "18", border: `1px solid ${color}55`, color,
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />
            {emp?.name || `Staff #${id}`}
            <button
              onClick={() => onRemove(id)}
              aria-label={`Stop overlaying ${emp?.name || "this staff member"}`}
              style={{ border: "none", background: "none", cursor: "pointer", color, fontSize: 12, lineHeight: 1, padding: 0, marginLeft: 2 }}
            >
              ✕
            </button>
          </span>
        );
      })}
    </div>
  );
}
