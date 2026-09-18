"use client";

import * as React from "react";
import {
  onSettingsChange, resolve, setSetting, SETTINGS,
  type ResolvedSetting, type SettingScope, type SettingValue,
} from "@summit/settings";
import { useSession } from "@/components/session-provider";

/**
 * Shared building blocks for Settings. Every control renders from the central
 * registry, shows which level owns it (Organization / Role / Personal), and —
 * when a user override is allowed — the inheritance chain with a reset.
 *
 * Writing an Organization Setting is admin-only at the RLS layer
 * (`org_settings_admin_*`, migration 0012 — `auth_role() = 'admin'`). Before
 * this, a clinician or supervisor could click any org-scope control here and
 * `setSetting()` would try the write, get blocked by RLS, roll back
 * optimistically, and throw an unhandled rejection with no on-screen
 * explanation — the "RLS returns empty sets, not errors" trap in spirit,
 * even though this particular write path does raise (upsert's `with check`
 * failure), because nothing here awaited or surfaced it. Disabling the
 * control for non-admins avoids the doomed round trip entirely.
 */

export function useSettingsTick(): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => onSettingsChange(() => setTick((t) => t + 1)), []);
  return tick;
}

export const SCOPE_LABEL: Record<SettingScope, string> = {
  org: "Organization Setting",
  role: "Role Setting",
  user: "Personal Preference",
};

/** The level this control writes to for the current (preview) user: an admin-clinician. */
function writeLevel(r: ResolvedSetting): SettingScope {
  if (r.def.scope === "user") return "user";
  if (r.def.userOverridable && !r.def.locked) return "user";
  return "org";
}

export function SettingRow({ settingKey }: { settingKey: string }) {
  useSettingsTick();
  const { identity } = useSession();
  const r = resolve(settingKey);
  const level = writeLevel(r);
  const overriding = level === "user" && r.def.scope !== "user";
  // Only admins can write org_settings (RLS: auth_role() = 'admin', migration
  // 0012). Preview mode has no real RLS to hit, so don't block there.
  const orgWriteBlocked = level === "org" && !identity?.isPreview && identity?.appRole !== "admin";

  // setSetting() announces both halves itself (@summit/toast), so nothing
  // here reports the outcome a second time. The catch is only so its rethrow
  // on a denied write stops surfacing as an unhandled rejection.
  const set = (v: SettingValue) => {
    if (orgWriteBlocked) return;
    void setSetting(settingKey, v, level).catch(() => {});
  };

  return (
    <div className="set-row" id={`setting-${settingKey.replace(/\./g, "-")}`}>
      <div className="set-meta">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b>{r.def.label}</b>
          <span className={`pill ${r.def.scope === "user" ? "accent" : "neutral"}`} style={{ flex: "none" }}>
            {SCOPE_LABEL[r.def.scope]}
          </span>
          {r.def.locked ? <span className="pill warn" title="Users cannot override this setting.">🔒 Organization Controlled</span> : null}
          {orgWriteBlocked ? (
            <span className="pill warn" title="Only an administrator can change organization settings.">🔒 Admin only</span>
          ) : null}
        </div>
        {r.def.description ? <p className="sub" style={{ maxWidth: "58ch" }}>{r.def.description}</p> : null}
        {overriding ? (
          <p className="set-chain">
            Org default: <b>{String(r.org ?? r.def.default)}</b>
            {" → "}My preference: <b>{r.user != null ? String(r.user) : "not set"}</b>
            {r.user != null ? (
              <button className="btn ghost" style={{ padding: "2px 8px", marginLeft: 8 }} onClick={() => void setSetting(settingKey, null, "user").catch(() => {})}>
                Use default
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="set-control">
        <SettingControl r={r} disabled={orgWriteBlocked} onChange={set} />
      </div>
    </div>
  );
}

/**
 * Colour, as a swatch and a hex box.
 *
 * The hex box keeps a local draft. It used to write straight through on every
 * keystroke, so typing "#1b5a6e" sent "#", "#1", "#1b"... - each one a write,
 * and now each one a value setSetting() rejects as not a colour. The draft
 * is what the box shows while it is being edited; only a complete #rrggbb is
 * committed, and leaving the box with something incomplete puts the stored
 * value back rather than leaving a half-typed colour on screen.
 */
function ColorControl({ r, disabled, onChange }: {
  r: ResolvedSetting; disabled?: boolean; onChange: (v: SettingValue) => void;
}) {
  const stored = String(r.effective);
  const [draft, setDraft] = React.useState(stored);
  const [editing, setEditing] = React.useState(false);
  const shown = editing ? draft : stored;

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="color" aria-label={r.def.label} value={stored} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 42, height: 32, border: "1px solid var(--line)", borderRadius: 6, background: "none", padding: 2 }} />
      <input className="input" style={{ width: 100 }} aria-label={`${r.def.label} hex`}
        value={shown} disabled={disabled}
        onFocus={() => { setDraft(stored); setEditing(true); }}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
        }} />
    </span>
  );
}

/**
 * A number, with the same draft treatment and for the same reason: the field
 * used to send Number(e.target.value) on every keystroke, which is NaN while
 * the box is empty or holds "-" or "1e".
 */
function NumberControl({ r, disabled, onChange }: {
  r: ResolvedSetting; disabled?: boolean; onChange: (v: SettingValue) => void;
}) {
  const stored = String(Number(r.effective));
  const [draft, setDraft] = React.useState(stored);
  const [editing, setEditing] = React.useState(false);

  return (
    <input type="number" className="input" aria-label={r.def.label} disabled={disabled}
      value={editing ? draft : stored}
      onFocus={() => { setDraft(stored); setEditing(true); }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        const n = Number(next);
        if (next.trim() !== "" && Number.isFinite(n)) onChange(n);
      }}
      style={{ width: 110 }} />
  );
}

function SettingControl({ r, disabled, onChange }: {
  r: ResolvedSetting; disabled?: boolean; onChange: (v: SettingValue) => void;
}) {
  const id = `ctl-${r.def.key.replace(/\./g, "-")}`;
  switch (r.def.type) {
    case "toggle":
      return (
        <button
          role="switch" aria-checked={r.effective === true} aria-label={r.def.label}
          className={`switch ${r.effective === true ? "on" : ""}`}
          disabled={disabled}
          onClick={() => onChange(!(r.effective === true))}
        >
          <span className="knob" />
        </button>
      );
    case "select":
      return (
        <select id={id} aria-label={r.def.label} className="input" value={String(r.effective)} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}>
          {(r.def.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "color":
      return <ColorControl r={r} disabled={disabled} onChange={onChange} />;
    case "time":
      return <input type="time" className="input" aria-label={r.def.label} value={String(r.effective)} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} style={{ width: 130 }} />;
    case "number":
      return <NumberControl r={r} disabled={disabled} onChange={onChange} />;
    default:
      return <input className="input" aria-label={r.def.label} value={String(r.effective)} disabled={disabled}
        placeholder={r.def.label} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 220 }} />;
  }
}

/** Definition-driven section body: every registry setting for the slug, in order. */
export function GenericSection({ slug, exclude = [] }: { slug: string; exclude?: string[] }) {
  const defs = SETTINGS.filter((s) => s.section === slug && !exclude.includes(s.key) && !s.key.startsWith("terminology."));
  return (
    <div className="set-list">
      {defs.map((d) => <SettingRow key={d.key} settingKey={d.key} />)}
    </div>
  );
}
