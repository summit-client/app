import * as React from "react";
import { ageOf, displayName, type Family, type FamilyChild, type FamilyView } from "../lib/family";

/**
 * Who the parent is currently looking at.
 *
 * The one control that has to be right in this portal. A parent with two
 * children reads every screen through it, and if they are ever unsure which
 * child a number belongs to, the number is worse than useless.
 *
 * So: the current child is always named in the trigger, never implied by an
 * avatar alone; switching states the change out loud for screen readers; and a
 * family of one renders no control at all, because a switcher with one option
 * is furniture.
 *
 * It is a native <button> + list rather than a <select> so each option can
 * carry an avatar and an age, and it degrades to a plain focusable list without
 * JavaScript positioning.
 */

const INK = "#173247";
const MUTED = "#607987";
const LINE = "#d4e2e8";
const ACCENT = "#0C5350";
const TINT = "#F1F7F4";

/** Initials, capped at two, from whatever name we actually have. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A colour per child, derived from the client id so it is stable across loads
 * and devices. Never the only signal: the name is always beside it, because
 * colour alone fails for a colour-blind parent and in a screenshot.
 */
const AVATAR_TINTS = ["#0C5350", "#145E7B", "#3A5B60", "#26B6C1", "#8A5A12"];
function tintFor(clientId: number): string {
  return AVATAR_TINTS[clientId % AVATAR_TINTS.length];
}

export function FamilyAvatar({
  label, clientId, size = 28,
}: { label: string; clientId: number | null; size?: number }) {
  const bg = clientId == null ? "#3A5B60" : tintFor(clientId);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "50%", background: bg,
        color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.4), fontWeight: 600, flexShrink: 0, letterSpacing: ".01em",
      }}
    >
      {initials(label)}
    </span>
  );
}

export function FamilySwitcher({
  family, view, onChange,
}: {
  family: Family;
  view: FamilyView;
  onChange: (next: FamilyView) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const current: FamilyChild | null =
    view.kind === "child" ? family.children.find((c) => c.clientId === view.clientId) ?? null : null;
  const label = current ? displayName(current) : (family.householdName ?? "Family");

  // Close on an outside click or Escape. Escape returns focus to the trigger,
  // or a keyboard user is left with focus on nothing.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: FamilyView) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
    const name = next.kind === "family"
      ? (family.householdName ?? "the whole family")
      : displayName(family.children.find((c) => c.clientId === next.clientId)!);
    // Switching changes every figure on the page. A sighted parent sees that;
    // a screen-reader user gets nothing unless it is said.
    setAnnouncement(`Now viewing ${name}`);
  }

  // One child is not a choice. Show who it is and stop.
  if (family.children.length <= 1) {
    const only = family.children[0];
    if (!only) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <FamilyAvatar label={displayName(only)} clientId={only.clientId} />
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{displayName(only)}</div>
          {ageOf(only) != null ? (
            <div style={{ fontSize: 12, color: MUTED }}>Age {ageOf(only)}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <span aria-live="polite" className="sr-only">{announcement}</span>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        // The accessible name says what this control does AND its current
        // value. "Maya" alone would leave a screen-reader user guessing what
        // the button is for.
        aria-label={`Viewing ${label}. Change who you are viewing.`}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 12px 6px 6px", borderRadius: 999,
          border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer",
          minHeight: 44, // thumb-sized on a phone
        }}
      >
        <FamilyAvatar label={label} clientId={current?.clientId ?? null} />
        <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{label}</span>
        <span aria-hidden="true" style={{ color: MUTED, fontSize: 11 }}>▼</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Who to view"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
            minWidth: 248, margin: 0, padding: 6, listStyle: "none",
            background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12,
            boxShadow: "0 12px 32px rgba(20,60,80,.14)",
          }}
        >
          {family.children.map((c) => {
            const selected = view.kind === "child" && view.clientId === c.clientId;
            const age = ageOf(c);
            return (
              <li key={c.clientId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose({ kind: "child", clientId: c.clientId })}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", minHeight: 44, borderRadius: 8,
                    border: "none", background: selected ? TINT : "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <FamilyAvatar label={displayName(c)} clientId={c.clientId} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK }}>
                      {displayName(c)}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: MUTED }}>
                      {age != null ? `Age ${age}` : "Client"}
                      {c.status && c.status !== "active" ? ` · ${c.status}` : ""}
                    </span>
                  </span>
                  {/* A tick as well as the tint: selection must not rest on
                      colour alone. */}
                  {selected ? <span aria-hidden="true" style={{ color: ACCENT }}>✓</span> : null}
                </button>
              </li>
            );
          })}

          <li aria-hidden="true" style={{ height: 1, background: LINE, margin: "6px 8px" }} />

          <li>
            <button
              type="button"
              role="option"
              aria-selected={view.kind === "family"}
              onClick={() => choose({ kind: "family" })}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", minHeight: 44, borderRadius: 8,
                border: "none", background: view.kind === "family" ? TINT : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <FamilyAvatar label={family.householdName ?? "Family"} clientId={null} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK }}>
                  Everyone
                </span>
                <span style={{ display: "block", fontSize: 12, color: MUTED }}>
                  {family.children.length} children · all appointments and tasks
                </span>
              </span>
              {view.kind === "family" ? <span aria-hidden="true" style={{ color: ACCENT }}>✓</span> : null}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
