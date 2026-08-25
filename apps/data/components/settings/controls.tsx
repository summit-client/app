"use client";

import * as React from "react";
import {
  onSettingsChange, resolve, setSetting, SETTINGS,
  type ResolvedSetting, type SettingScope, type SettingValue,
} from "@summit/settings";

/**
 * Shared building blocks for Settings. Every control renders from the central
 * registry, shows which level owns it (Organization / Role / Personal), and —
 * when a user override is allowed — the inheritance chain with a reset.
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
  const r = resolve(settingKey);
  const level = writeLevel(r);
  const overriding = level === "user" && r.def.scope !== "user";

  const set = (v: SettingValue) => setSetting(settingKey, v, level);

  return (
    <div className="set-row" id={`setting-${settingKey.replace(/\./g, "-")}`}>
      <div className="set-meta">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b>{r.def.label}</b>
          <span className={`pill ${r.def.scope === "user" ? "accent" : "neutral"}`} style={{ flex: "none" }}>
            {SCOPE_LABEL[r.def.scope]}
          </span>
          {r.def.locked ? <span className="pill warn" title="Users cannot override this setting.">🔒 Organization Controlled</span> : null}
        </div>
        {r.def.description ? <p className="sub" style={{ maxWidth: "58ch" }}>{r.def.description}</p> : null}
        {overriding ? (
          <p className="set-chain">
            Org default: <b>{String(r.org ?? r.def.default)}</b>
            {" → "}My preference: <b>{r.user != null ? String(r.user) : "not set"}</b>
            {r.user != null ? (
              <button className="btn ghost" style={{ padding: "2px 8px", marginLeft: 8 }} onClick={() => setSetting(settingKey, null, "user")}>
                Use default
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="set-control">
        <SettingControl r={r} disabled={r.def.locked && level !== "org" && false} onChange={set} />
      </div>
    </div>
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
      return (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input type="color" aria-label={r.def.label} value={String(r.effective)} disabled={disabled}
            onChange={(e) => onChange(e.target.value)} style={{ width: 42, height: 32, border: "1px solid var(--line)", borderRadius: 6, background: "none", padding: 2 }} />
          <input className="input" style={{ width: 100 }} aria-label={`${r.def.label} hex`} value={String(r.effective)}
            onChange={(e) => onChange(e.target.value)} />
        </span>
      );
    case "time":
      return <input type="time" className="input" aria-label={r.def.label} value={String(r.effective)} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} style={{ width: 130 }} />;
    case "number":
      return <input type="number" className="input" aria-label={r.def.label} value={Number(r.effective)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: 110 }} />;
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
