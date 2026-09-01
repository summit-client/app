/**
 * Four independent filter menus - Locations / Session Types / Clinicians /
 * Clients - replacing the earlier single "Filter" button that opened one
 * dropdown with all four always-expanded inside it. Locations and Session
 * Types stay the toggle-pill pattern this app already uses elsewhere, and
 * open on hover (a short, low-cardinality list someone wants to skim
 * quickly). Clinicians and Clients can run into the hundreds (Adina's
 * clinic: 135 clients, 20 staff), so those two are click-opened searchable,
 * alphabetical-by-last-name lists with an "All" row at the top instead -
 * scanning a big pill wrap doesn't scale the way a filtered list does.
 *
 * Combines as AND across the four categories, OR within one category (pick
 * two clinicians and you see either of their sessions; add a location
 * filter and you only see sessions matching both).
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

/** Last word of the display name, standing in for "last name" - there is no
 *  structured first/last name field anywhere in this schema (clients.name /
 *  staff.name are both single free-text strings), so this is the only
 *  available proxy. */
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

const triggerStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
  border: `0.5px solid ${active ? "#5DCAA5" : COLORS.border}`,
  background: active ? "#5DCAA512" : COLORS.bg,
  color: active ? "#3f9c78" : COLORS.text, cursor: "pointer",
});

const countBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 15, height: 15,
  borderRadius: 8, background: "#5DCAA5", color: "#fff", fontSize: 10, padding: "0 4px",
};

const panelStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60,
  minWidth: 220, maxHeight: 360, overflowY: "auto",
  background: COLORS.bg, border: `0.5px solid ${COLORS.border}`, borderRadius: 10,
  boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 12,
};

function ClearAllLink({ onClearAll }: { onClearAll: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClearAll(); }}
      style={{ fontSize: 11.5, color: COLORS.textT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: 8 }}
    >
      Clear all filters
    </button>
  );
}

/** Closes on outside click, and on Escape - shared by both menu kinds so
 *  none of them need "click Filter again" to collapse.
 *
 *  `openKey`/`setOpenKey` are lifted to FilterPanel (one shared "which menu
 *  is open" slot, `own` is this instance's own key) rather than each menu
 *  keeping an independent local `open` boolean - see useHoverIntent below
 *  for why a per-menu boolean isn't enough on its own. */
function useMenu(own: string, openKey: string | null, setOpenKey: React.Dispatch<React.SetStateAction<string | null>>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const open = openKey === own;
  const setOpen = React.useCallback((v: boolean) => setOpenKey(v ? own : null), [own, setOpenKey]);
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);
  return { open, setOpen, ref };
}

/** Hover-intent for the pill menus below: a plain onMouseLeave={() =>
 *  setOpen(false)} closed the instant the cursor left the trigger button,
 *  which is well before it could reach the panel sitting 4px below it (see
 *  panelStyle's `top: calc(100% + 4px)`) - that gap (and the panel being
 *  wider than the trigger, so a diagonal path toward a pill drifts outside
 *  the trigger's own box) is empty space the pointer crosses on the way
 *  down, which fires a real mouseleave before ever reaching the panel.
 *  Closing on a short delay, cancelled by re-entering either the trigger or
 *  the panel (both share one wrapper, so one onMouseEnter covers both),
 *  gives the cursor time to actually arrive.
 *
 *  That delay is exactly what caused issue #133's "switch between two open
 *  filters and the old list stays visible too long, overlapping the new
 *  one": Locations and Session types each kept their own independent local
 *  `open` state, so moving the pointer from one trigger straight to the
 *  next opened the new menu immediately (its own onMouseEnter) while the
 *  old one's onMouseLeave-started close timer was still counting down -
 *  for up to `closeDelayMs`, BOTH panels were open and visibly overlapped.
 *  Now that `open` is derived from one shared `openKey` (see useMenu
 *  above), setOpenKey(own) on entry closes every other menu in the same
 *  render, synchronously - no delay to race. The delayed close below still
 *  runs (so leaving the trigger without moving to another menu still has
 *  the original grace period to reach the panel), but it's a functional
 *  update guarded against staleness: if something else already changed
 *  openKey by the time it fires, it's a no-op instead of clobbering
 *  whichever menu is now actually open. */
function useHoverIntent(own: string, setOpenKey: React.Dispatch<React.SetStateAction<string | null>>, closeDelayMs = 350) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = React.useCallback(() => {
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
  }, []);
  React.useEffect(() => cancel, [cancel]);
  return {
    onMouseEnter: () => { cancel(); setOpenKey(own); },
    onMouseLeave: () => {
      cancel();
      timer.current = setTimeout(() => setOpenKey((cur) => (cur === own ? null : cur)), closeDelayMs);
    },
  };
}

function PillFilterMenu<T extends string | number>({
  label, items, selected, onToggle, onClearAll, menuKey, openKey, setOpenKey,
}: {
  label: string;
  items: { id: T; label: string; color?: string }[];
  selected: Set<T>;
  onToggle: (id: T) => void;
  onClearAll: () => void;
  menuKey: string;
  openKey: string | null;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { open, setOpen, ref } = useMenu(menuKey, openKey, setOpenKey);
  const hover = useHoverIntent(menuKey, setOpenKey);
  return (
    <div
      ref={ref}
      style={{ position: "relative" }}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      {/* setOpen(true), not a toggle - reaching this button with a mouse
          means the pointer already crossed the wrapper and fired
          onMouseEnter, which opened the panel via hover-intent above. A
          toggle here then immediately flips that back to closed as part of
          the very same click, before either state update ever paints -
          React batches them - so the panel never visibly opens at all. A
          real click always looks like nothing happened; only a
          hover-without-clicking, or a click reached without crossing the
          wrapper first (keyboard Tab+Enter, most touch browsers), avoided
          it. Idempotent open is still correct for those paths, and closing
          is already covered by outside-click, Escape, and the hover-leave
          delay - this button doesn't need to also close it. */}
      <button onClick={() => setOpen(true)} style={triggerStyle(selected.size > 0)}>
        {label} {selected.size > 0 && <span style={countBadge}>{selected.size}</span>}
      </button>
      {open && (
        <div style={panelStyle}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textT, padding: "4px 2px" }}>None yet</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 260 }}>
              {items.map((item) => {
                const active = selected.has(item.id);
                return (
                  <button
                    key={String(item.id)}
                    onClick={() => onToggle(item.id)}
                    style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12.5,
                      border: `1px solid ${active ? (item.color || "#5DCAA5") : COLORS.border}`,
                      background: active ? (item.color || "#5DCAA5") + "18" : COLORS.bg,
                      color: active ? (item.color || "#3f9c78") : COLORS.textS,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
          <ClearAllLink onClearAll={onClearAll} />
        </div>
      )}
    </div>
  );
}

function SearchFilterMenu<T extends number>({
  label, items, selected, onToggle, onClearAll, menuKey, openKey, setOpenKey,
}: {
  label: string;
  items: { id: T; name: string }[];
  selected: Set<T>;
  onToggle: (id: T) => void;
  onClearAll: () => void;
  menuKey: string;
  openKey: string | null;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { open, setOpen, ref } = useMenu(menuKey, openKey, setOpenKey);
  const [query, setQuery] = React.useState("");

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name))),
    [items],
  );
  const filtered = query.trim()
    ? sorted.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={triggerStyle(selected.size > 0)}>
        {label} {selected.size > 0 && <span style={countBadge}>{selected.size}</span>}
      </button>
      {open && (
        <div style={{ ...panelStyle, minWidth: 240 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13, marginBottom: 8 }}
          />
          <div
            onClick={onClearAll}
            style={{ padding: "5px 6px", borderRadius: 6, fontSize: 13, fontWeight: selected.size === 0 ? 500 : 400, color: selected.size === 0 ? "#3f9c78" : COLORS.text, background: selected.size === 0 ? "#5DCAA512" : "transparent", cursor: "pointer" }}
          >
            All
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: COLORS.textT, padding: "6px" }}>No matches</div>}
            {filtered.map((i) => {
              const active = selected.has(i.id);
              return (
                <label
                  key={i.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, fontSize: 13, cursor: "pointer", color: active ? "#0F6E56" : COLORS.text, background: active ? "#5DCAA512" : "transparent" }}
                >
                  <input type="checkbox" checked={active} onChange={() => onToggle(i.id)} style={{ accentColor: "#5DCAA5" }} />
                  {i.name}
                </label>
              );
            })}
          </div>
          <ClearAllLink onClearAll={onClearAll} />
        </div>
      )}
    </div>
  );
}

/** Single-select searchable, alphabetical-by-last-name dropdown - the same
 *  shape SearchFilterMenu above already uses for the Clinicians/Clients
 *  filters, adapted from "toggle a Set of many" to "pick exactly one and
 *  close" for the Create wizard's client picker (issue #133 item 5: that
 *  picker was a flat wall of pills, unusable once a clinic has more than a
 *  handful of clients - "135 people plus for a large clinic," per the
 *  report). Reused rather than reinvented since this is exactly the problem
 *  SearchFilterMenu already solves. */
export function SearchSelectMenu<T extends number>({
  label, items, selectedId, onSelect, placeholder,
}: {
  label: string;
  items: { id: T; name: string }[];
  selectedId: T | null;
  onSelect: (id: T) => void;
  placeholder?: string;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const { open, setOpen, ref } = useMenu("select", openKey, setOpenKey);
  const [query, setQuery] = React.useState("");

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name))),
    [items],
  );
  const filtered = query.trim()
    ? sorted.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;
  const selected = items.find((i) => i.id === selectedId);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "7px 12px", borderRadius: 8, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          border: `0.5px solid ${selected ? "#5DCAA5" : COLORS.borderS}`, background: selected ? "#5DCAA50c" : COLORS.bgS,
          color: selected ? COLORS.text : COLORS.textT, cursor: "pointer", width: "100%", minWidth: 220, textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.name : (placeholder || `Select a ${label.toLowerCase()}…`)}
        </span>
        <span aria-hidden="true" style={{ color: COLORS.textT, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ ...panelStyle, minWidth: 260, width: "100%" }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 13, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: COLORS.textT, padding: "6px" }}>No matches</div>}
            {filtered.map((i) => {
              const active = i.id === selectedId;
              return (
                <div
                  key={i.id}
                  onClick={() => { onSelect(i.id); setOpen(false); setQuery(""); }}
                  style={{ padding: "6px 8px", borderRadius: 6, fontSize: 13.5, cursor: "pointer", fontWeight: active ? 600 : 400, color: active ? "#0F6E56" : COLORS.text, background: active ? "#5DCAA512" : "transparent" }}
                >
                  {i.name}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface CalPickerCalendar { id: number; name: string; status: string; }

/** Single-select calendar dropdown, reintroduced by request after the
 *  rebuild dropped per-calendar filtering from this view entirely - a
 *  scheduler with more than one calendar (a confirmed active one plus a
 *  draft they're staging, say) has no other way to jump straight to one in
 *  particular. "All calendars" (null) is the default/clear state and shows
 *  everything, same as before this existed. Opens on hover like the other
 *  pill menus, same forgiving delay. */
export function CalendarPicker({
  calendars, selectedId, onChange,
}: {
  calendars: CalPickerCalendar[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
}) {
  // Its own single-slot "open" state (own="calendar-picker", never shared
  // with anything else) - this dropdown lives outside FilterPanel, in its
  // own spot on the toolbar, so it was never part of the Locations/Session
  // types overlap regression that made FilterPanel's four menus share a
  // slot (see useMenu's own comment above).
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const { open, setOpen, ref } = useMenu("calendar-picker", openKey, setOpenKey);
  const hover = useHoverIntent("calendar-picker", setOpenKey);
  const visible = calendars.filter((c) => c.status !== "archived");
  const selected = visible.find((c) => c.id === selectedId);

  return (
    <div ref={ref} style={{ position: "relative" }} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave}>
      {/* setOpen(true), not a toggle - see PillFilterMenu's identical
          button above for why a toggle here makes a real mouse click a
          no-op (hover-intent already opened it by the time the click
          fires; toggling then immediately re-closes it in the same
          batch). */}
      <button onClick={() => setOpen(true)} style={triggerStyle(selectedId != null)}>
        {selected ? selected.name : "All calendars"}
      </button>
      {open && (
        <div style={{ ...panelStyle, minWidth: 200 }}>
          <div
            onClick={() => { onChange(null); setOpen(false); }}
            style={{ padding: "6px 8px", borderRadius: 6, fontSize: 13, fontWeight: selectedId == null ? 500 : 400, color: selectedId == null ? "#3f9c78" : COLORS.text, background: selectedId == null ? "#5DCAA512" : "transparent", cursor: "pointer" }}
          >
            All calendars
          </div>
          {visible.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textT, padding: "4px 2px" }}>No calendars yet</div>
          ) : (
            visible.map((cal) => {
              const active = selectedId === cal.id;
              return (
                <div
                  key={cal.id}
                  onClick={() => { onChange(cal.id); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 8px", borderRadius: 6, fontSize: 13, fontWeight: active ? 500 : 400, color: active ? "#3f9c78" : COLORS.text, background: active ? "#5DCAA512" : "transparent", cursor: "pointer" }}
                >
                  {cal.name}
                  <span style={{ fontSize: 10.5, color: cal.status === "draft" ? "#8A5E10" : COLORS.textT }}>{cal.status}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function FilterPanel({
  locations, sessionTypes, employees, clients, filters, onChange,
}: {
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  employees: CalEmployee[];
  clients: CalClient[];
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
  onClose?: () => void;
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
  function clearCategory<K extends keyof CalendarFilters>(key: K) {
    onChange({ ...filters, [key]: new Set() });
  }
  function clearAll() {
    onChange(emptyFilters());
  }

  // One shared "which of these four menus is open" slot instead of each
  // menu owning an independent local boolean - see useMenu/useHoverIntent's
  // own comments above for the overlap bug this fixes (issue #133 item 4).
  const [openKey, setOpenKey] = React.useState<string | null>(null);

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <PillFilterMenu
        label="Locations"
        items={locations.map((l) => ({ id: l.id, label: l.name }))}
        selected={filters.locationIds}
        onToggle={(id) => toggle("locationIds", id)}
        onClearAll={clearAll}
        menuKey="locations" openKey={openKey} setOpenKey={setOpenKey}
      />
      <PillFilterMenu
        label="Session types"
        items={sessionTypes.map((t) => ({ id: t.name, label: t.name, color: t.color }))}
        selected={filters.typeNames}
        onToggle={(id) => toggle("typeNames", id)}
        onClearAll={clearAll}
        menuKey="sessionTypes" openKey={openKey} setOpenKey={setOpenKey}
      />
      <SearchFilterMenu
        label="Clinicians"
        items={employees.map((e) => ({ id: e.id, name: e.name }))}
        selected={filters.employeeIds}
        onToggle={(id) => toggle("employeeIds", id)}
        onClearAll={clearAll}
        menuKey="clinicians" openKey={openKey} setOpenKey={setOpenKey}
      />
      <SearchFilterMenu
        label="Clients"
        items={clients.map((c) => ({ id: c.id, name: c.name }))}
        selected={filters.clientIds}
        onToggle={(id) => toggle("clientIds", id)}
        onClearAll={clearAll}
        menuKey="clients" openKey={openKey} setOpenKey={setOpenKey}
      />
      {activeFilterCount(filters) > 0 && (
        <button
          onClick={clearAll}
          style={{ fontSize: 12, color: COLORS.textT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", alignSelf: "center" }}
        >
          Clear all
        </button>
      )}
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
