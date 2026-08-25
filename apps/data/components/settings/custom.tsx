"use client";

import * as React from "react";
import { applyAccent, applyTheme, currentAccent, currentTheme, ACCENTS, type Accent } from "@summit/design";

const SWATCH: Record<Accent, string> = { blue: "#1b5a6e", green: "#2f5d3a", pink: "#a83a66", orange: "#b65a1f" };
import {
  readAudit, resolve, restore, setSetting, term, TERMINOLOGY_DEFAULTS, TERMINOLOGY_SUGGESTIONS,
} from "@summit/settings";
import { GenericSection, SettingRow, useSettingsTick } from "./controls";

/* ---- small store for structured (non-scalar) configuration collections ------- */

function useJsonPref<T>(key: string, dflt: T): [T, (v: T) => void] {
  const [v, setV] = React.useState<T>(dflt);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw) as T);
    } catch { /* corrupt pref — fall back to default */ }
  }, [key]);
  const save = (next: T) => {
    setV(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return [v, save];
}

/* ---- Appearance ---------------------------------------------------------------- */

const LOGO_SLOTS = ["Primary logo", "Square / icon", "Light background", "Dark background", "Email header", "Report header"];

export function AppearanceSection() {
  useSettingsTick();
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const theme = currentTheme();
  const accent = currentAccent();
  const primary = String(resolve("appearance.primaryColor").effective);
  const contrastOk = contrastRatio(primary, "#ffffff") >= 3;

  return (
    <div className="set-list">
      <div className="set-row">
        <div className="set-meta">
          <b>Interface theme</b>
          <span className="pill neutral" style={{ marginLeft: 8 }}>Personal Preference</span>
          <p className="sub">Applies across every Summit module immediately.</p>
        </div>
        <div className="set-control" style={{ display: "flex", gap: 6 }}>
          {(["light", "dark", "system"] as const).map((t) => (
            <button key={t} className={`mode-tab ${theme === t ? "active" : ""}`} onClick={() => { applyTheme(t); force(); }}>
              {t === "system" ? "System Default" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="set-row">
        <div className="set-meta">
          <b>Accent colour</b>
          <span className="pill neutral" style={{ marginLeft: 8 }}>Organization Setting</span>
          <p className="sub">Summit Blue is the default; the choice flows through every module.</p>
        </div>
        <div className="set-control" style={{ display: "flex", gap: 8 }}>
          {ACCENTS.map((a) => (
            <button
              key={a.key} aria-label={a.label} aria-pressed={accent === a.key}
              onClick={() => { applyAccent(a.key); force(); }}
              style={{
                width: 30, height: 30, borderRadius: "50%", background: SWATCH[a.key], cursor: "pointer",
                border: accent === a.key ? "3px solid var(--ink)" : "2px solid var(--line)",
              }}
            />
          ))}
        </div>
      </div>

      <GenericSection slug="appearance" />
      {!contrastOk ? (
        <p className="sub" style={{ color: "var(--warn)" }}>
          ⚠ The primary colour&rsquo;s contrast against white is below 3:1 — text on branded surfaces may be hard to read.
        </p>
      ) : null}

      <h3 className="set-h">Logos</h3>
      <p className="sub">Used across the staff dashboard, portals, reports, PDF exports, emails, forms, invoices and certificates.</p>
      <div className="logo-grid">
        {LOGO_SLOTS.map((s) => (
          <div key={s} className="logo-slot">
            <span className="sub" style={{ marginTop: 0 }}>{s}</span>
            <span className="pill neutral">Upload in production</span>
          </div>
        ))}
      </div>

      <h3 className="set-h">Live preview</h3>
      <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="brand-mark" aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: "var(--accent)", display: "inline-block" }} />
        <b>{String(resolve("org.name").effective)}</b>
        <button className="btn">Primary action</button>
        <button className="btn secondary">Secondary</button>
        <span className="pill accent">accent</span>
        <span className="pill good">good</span>
        <span className="pill warn">warning</span>
      </div>

      <div>
        <button className="btn secondary" onClick={() => {
          applyTheme("system"); applyAccent("blue");
          setSetting("appearance.primaryColor", null, "org"); setSetting("appearance.accentColor", null, "org");
          setSetting("appearance.density", null, "org"); force();
        }}>
          Reset to Summit Default
        </button>
      </div>
    </div>
  );
}

function contrastRatio(hex1: string, hex2: string): number {
  const lum = (hex: string) => {
    const m = hex.replace("#", "");
    if (m.length !== 6) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(m.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hex1), lum(hex2)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---- Language & Terminology ----------------------------------------------------- */

export function LanguageSection() {
  useSettingsTick();
  return (
    <div className="set-list">
      <SettingRow settingKey="language.interface" />
      <SettingRow settingKey="language.clientDefault" />

      <h3 className="set-h">Custom terminology</h3>
      <p className="sub" style={{ maxWidth: "62ch" }}>
        Change what Summit calls things and the wording updates throughout the platform — navigation, client pages,
        session screens, reports — not just one module.
      </p>
      <div className="card table-wrap" style={{ marginTop: 10 }}>
        <table className="data">
          <thead><tr><th>Summit default</th><th>Your organization uses</th></tr></thead>
          <tbody>
            {Object.keys(TERMINOLOGY_DEFAULTS).map((k) => <TermRow key={k} name={k} />)}
          </tbody>
        </table>
      </div>
      <div className="card card-pad" style={{ marginTop: 10, background: "var(--accent-soft)", border: "1px solid var(--line)" }}>
        <p className="sub" style={{ color: "var(--ink)", marginTop: 0 }}>
          Your organization will see: &ldquo;Start {term("client")} {term("session")}&rdquo; · &ldquo;My {term("client")}s&rdquo; ·
          &ldquo;{term("goal")}s near mastery&rdquo; · &ldquo;{term("supervisor")} review&rdquo;
        </p>
      </div>
    </div>
  );
}

function TermRow({ name }: { name: string }) {
  const key = `terminology.${name}`;
  const r = resolve(key);
  const suggestions = TERMINOLOGY_SUGGESTIONS[name] ?? [TERMINOLOGY_DEFAULTS[name]];
  return (
    <tr>
      <td><b>{TERMINOLOGY_DEFAULTS[name]}</b></td>
      <td>
        <select className="input" style={{ width: "auto", minWidth: 180 }} aria-label={`Term for ${TERMINOLOGY_DEFAULTS[name]}`}
          value={String(r.effective)} onChange={(e) => setSetting(key, e.target.value, "org")}>
          {suggestions.map((s) => <option key={s}>{s}</option>)}
          {!suggestions.includes(String(r.effective)) ? <option>{String(r.effective)}</option> : null}
        </select>
      </td>
    </tr>
  );
}

/* ---- Dashboard ------------------------------------------------------------------- */

const WIDGETS = [
  "Today's Sessions", "Clients Requiring Attention", "Run Session", "Missing Session Notes",
  "Supervisor Reviews", "Goals Near Mastery", "Goals With Declining Trends", "Behaviour Alerts",
  "Caseload Overview", "Tasks", "Messages", "Documents Awaiting Signature", "Training Progress", "AI Insights",
];

export function DashboardSection() {
  const [enabled, setEnabled] = useJsonPref<string[]>("summit-dashboard-widgets", ["Today's Sessions", "Clients Requiring Attention", "Run Session", "Supervisor Reviews"]);
  const toggle = (w: string) => setEnabled(enabled.includes(w) ? enabled.filter((x) => x !== w) : [...enabled, w]);
  const move = (w: string, d: -1 | 1) => {
    const i = enabled.indexOf(w);
    if (i < 0 || i + d < 0 || i + d >= enabled.length) return;
    const next = [...enabled];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setEnabled(next);
  };
  return (
    <div className="set-list">
      <p className="sub">Toggle widgets on or off and order them; your dashboard follows. Administrators can publish role templates (BCBA, Behaviour Clinician, Operations) from the Roles section.</p>
      <h3 className="set-h">Your dashboard, in order</h3>
      {enabled.map((w) => (
        <div key={w} className="set-row" style={{ alignItems: "center" }}>
          <b>{w}</b>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost" aria-label={`Move ${w} up`} onClick={() => move(w, -1)}>↑</button>
            <button className="btn ghost" aria-label={`Move ${w} down`} onClick={() => move(w, 1)}>↓</button>
            <button className="btn secondary" onClick={() => toggle(w)}>Hide</button>
          </span>
        </div>
      ))}
      <h3 className="set-h">Widget library</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {WIDGETS.filter((w) => !enabled.includes(w)).map((w) => (
          <button key={w} className="mode-tab" onClick={() => toggle(w)}>+ {w}</button>
        ))}
      </div>
      <div>
        <button className="btn secondary" onClick={() => setEnabled(["Today's Sessions", "Clients Requiring Attention", "Run Session", "Supervisor Reviews"])}>
          Restore Summit default
        </button>
      </div>
    </div>
  );
}

/* ---- Navigation ------------------------------------------------------------------- */

const MODULES = ["Today", "My Caseload", "Attention", "Review Queue", "Settings"];

export function NavigationSection() {
  const [hidden, setHidden] = useJsonPref<string[]>("summit-nav-hidden", []);
  return (
    <div className="set-list">
      <p className="sub">Hide the modules you don&rsquo;t use; mandatory items are locked by your administrator. The sidebar updates immediately.</p>
      {MODULES.map((m) => {
        const mandatory = m === "Settings" || m === "Today";
        const isHidden = hidden.includes(m);
        return (
          <div key={m} className="set-row" style={{ alignItems: "center" }}>
            <span><b>{m}</b>{mandatory ? <span className="pill warn" style={{ marginLeft: 8 }}>🔒 required</span> : null}</span>
            <button
              className={`switch ${!isHidden ? "on" : ""}`} role="switch" aria-checked={!isHidden} aria-label={`Show ${m}`}
              disabled={mandatory}
              onClick={() => setHidden(isHidden ? hidden.filter((x) => x !== m) : [...hidden, m])}
            ><span className="knob" /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Notifications ----------------------------------------------------------------- */

const NOTIFY_EVENTS: { group: string; events: string[] }[] = [
  { group: "Clinical", events: ["Session assigned", "Session starting soon", "Data missing", "Goal reaches mastery criteria", "Goal regression detected", "Behaviour threshold exceeded", "Note awaiting signature", "Supervisor review requested", "Report ready", "Clinical alert generated"] },
  { group: "Administrative", events: ["New client", "Form completed", "Form overdue", "Authorization expiring", "Staff schedule changed"] },
  { group: "Communication", events: ["New direct message", "Mention", "Caregiver message", "Message awaiting response"] },
];
const CHANNELS = ["In-App", "Email", "SMS", "Push"];

export function NotificationsSection() {
  const [matrix, setMatrix] = useJsonPref<Record<string, string[]>>("summit-notify-matrix", {});
  const isOn = (ev: string, ch: string) => (matrix[ev] ?? ["In-App"]).includes(ch);
  const flip = (ev: string, ch: string) => {
    const cur = matrix[ev] ?? ["In-App"];
    setMatrix({ ...matrix, [ev]: isOn(ev, ch) ? cur.filter((c) => c !== ch) : [...cur, ch] });
  };
  return (
    <div className="set-list">
      <SettingRow settingKey="notify.cadence" />
      <div className="set-row">
        <div className="set-meta">
          <b>Quiet hours</b>
          <span className="pill accent" style={{ marginLeft: 8 }}>Personal Preference</span>
          <p className="sub">Non-urgent notifications hold during this window.</p>
        </div>
        <div className="set-control" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <QuietTime k="notify.quietStart" /> – <QuietTime k="notify.quietEnd" />
        </div>
      </div>
      <SettingRow settingKey="notify.urgentOverride" />

      {NOTIFY_EVENTS.map(({ group, events }) => (
        <React.Fragment key={group}>
          <h3 className="set-h">{group}</h3>
          <div className="card table-wrap">
            <table className="data">
              <thead><tr><th>Event</th>{CHANNELS.map((c) => <th key={c} style={{ textAlign: "center" }}>{c}</th>)}</tr></thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev}>
                    <td>{ev}</td>
                    {CHANNELS.map((ch) => (
                      <td key={ch} style={{ textAlign: "center" }}>
                        <input type="checkbox" aria-label={`${ev} via ${ch}`} checked={isOn(ev, ch)} onChange={() => flip(ev, ch)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function QuietTime({ k }: { k: string }) {
  useSettingsTick();
  const r = resolve(k);
  return <input type="time" className="input" style={{ width: 120 }} aria-label={r.def.label}
    value={String(r.effective)} onChange={(e) => setSetting(k, e.target.value, "user")} />;
}

/* ---- Roles & Permissions ------------------------------------------------------------ */

const ROLES = ["Administrator", "Clinical Supervisor", "BCBA/RBA", "Behaviour Clinician", "RBT/IBT", "Front Desk", "Parent/Caregiver"];
const PERM_MODULES = ["Clients", "Run Session", "Programs", "Reports", "Documents", "Billing", "Settings"];
const PERMS = ["View", "Create", "Edit", "Approve", "Export"];

const DEFAULT_GRID: Record<string, Record<string, string[]>> = {
  "Administrator": Object.fromEntries(PERM_MODULES.map((m) => [m, PERMS])),
  "Clinical Supervisor": { Clients: PERMS, "Run Session": PERMS, Programs: PERMS, Reports: PERMS, Documents: ["View", "Create", "Edit"], Billing: ["View"], Settings: ["View"] },
  "BCBA/RBA": { Clients: ["View", "Create", "Edit"], "Run Session": ["View", "Create", "Edit"], Programs: PERMS, Reports: ["View", "Create", "Edit", "Approve"], Documents: ["View", "Create"], Billing: [], Settings: ["View"] },
  "Behaviour Clinician": { Clients: ["View"], "Run Session": ["View", "Create", "Edit"], Programs: ["View"], Reports: ["View"], Documents: ["View"], Billing: [], Settings: ["View"] },
  "RBT/IBT": { Clients: ["View"], "Run Session": ["View", "Create"], Programs: ["View"], Reports: [], Documents: ["View"], Billing: [], Settings: [] },
  "Front Desk": { Clients: ["View", "Create"], "Run Session": [], Programs: [], Reports: [], Documents: ["View", "Create"], Billing: ["View", "Create"], Settings: [] },
  "Parent/Caregiver": { Clients: [], "Run Session": [], Programs: [], Reports: ["View"], Documents: ["View", "Create"], Billing: ["View"], Settings: [] },
};

export function RolesSection() {
  const [grid, setGrid] = useJsonPref("summit-role-grid", DEFAULT_GRID);
  const [role, setRole] = React.useState(ROLES[2]);
  const has = (m: string, p: string) => (grid[role]?.[m] ?? []).includes(p);
  const flip = (m: string, p: string) => {
    const cur = grid[role]?.[m] ?? [];
    setGrid({ ...grid, [role]: { ...grid[role], [m]: has(m, p) ? cur.filter((x) => x !== p) : [...cur, p] } });
  };
  return (
    <div className="set-list">
      <p className="sub">Granular permissions per role — View scope in live mode is additionally bounded by RLS (assigned clients → caseload → organization).</p>
      <div className="mode-tabs" role="tablist" aria-label="Role">
        {ROLES.map((r) => (
          <button key={r} role="tab" aria-selected={role === r} className={`mode-tab ${role === r ? "active" : ""}`} onClick={() => setRole(r)}>{r}</button>
        ))}
      </div>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Module</th>{PERMS.map((p) => <th key={p} style={{ textAlign: "center" }}>{p}</th>)}</tr></thead>
          <tbody>
            {PERM_MODULES.map((m) => (
              <tr key={m}>
                <td><b>{m}</b></td>
                {PERMS.map((p) => (
                  <td key={p} style={{ textAlign: "center" }}>
                    <input type="checkbox" aria-label={`${role}: ${p} ${m}`} checked={has(m, p)} onChange={() => flip(m, p)}
                      disabled={role === "Administrator"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === "Administrator" ? <p className="sub">The Administrator role always holds full permissions.</p> : null}
    </div>
  );
}

/* ---- Integrations --------------------------------------------------------------------- */

const INTEGRATIONS = [
  { name: "Google Workspace", access: "Calendar events you create · email you choose to send", connected: false },
  { name: "Microsoft 365", access: "Calendar events you create · email you choose to send", connected: false },
  { name: "Calendar", access: "Two-way sync of your Summit schedule", connected: true },
  { name: "Email", access: "Sending Summit messages from your address", connected: true },
  { name: "Accounting", access: "Invoices and payments you export", connected: false },
  { name: "Payments", access: "Charges you initiate — card data never touches Summit", connected: true },
];

export function IntegrationsSection() {
  const [state, setState] = useJsonPref<Record<string, boolean>>("summit-integrations", Object.fromEntries(INTEGRATIONS.map((i) => [i.name, i.connected])));
  return (
    <div className="set-list">
      <p className="sub">Each card shows exactly what Summit can access. Connecting a live account uses that provider&rsquo;s own sign-in — Summit never sees your password.</p>
      <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <b>{i.name}</b>
              <span className={`pill ${state[i.name] ? "good" : "neutral"}`}>{state[i.name] ? "Connected" : "Not connected"}</span>
            </div>
            <p className="sub" style={{ marginTop: 6 }}>Access: {i.access}</p>
            <button className={`btn ${state[i.name] ? "secondary" : ""}`} style={{ marginTop: 10 }}
              onClick={() => setState({ ...state, [i.name]: !state[i.name] })}>
              {state[i.name] ? "Disconnect" : "Connect"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Tasks & Automations ---------------------------------------------------------------- */

interface Rule { when: string; iff: string; then: string; on: boolean }
const SEED_RULES: Rule[] = [
  { when: "A session ends", iff: "A session note has not been signed within 24 hours", then: "Notify clinician", on: true },
  { when: "Goal reaches mastery criterion", iff: "—", then: "Notify supervisor and recommend review", on: true },
  { when: "Authorization has fewer than 10 hours remaining", iff: "—", then: "Notify billing and clinical supervisor", on: true },
  { when: "Month ends", iff: "—", then: "Generate progress review task", on: false },
];
const WHENS = ["A session ends", "Goal reaches mastery criterion", "Authorization has fewer than 10 hours remaining", "Month ends", "Note is returned by supervisor", "New client is created"];
const IFFS = ["—", "A session note has not been signed within 24 hours", "The client is OAP-funded", "The goal has declined for 2 weeks"];
const THENS = ["Notify clinician", "Notify supervisor and recommend review", "Notify billing and clinical supervisor", "Generate progress review task", "Create a task for the assigned clinician"];

export function AutomationsSection() {
  const [rules, setRules] = useJsonPref<Rule[]>("summit-automations", SEED_RULES);
  const [draft, setDraft] = React.useState<Rule>({ when: WHENS[0], iff: IFFS[0], then: THENS[0], on: true });
  return (
    <div className="set-list">
      <h3 className="set-h">Automation rules</h3>
      <p className="sub">WHEN → IF → THEN. No coding required.</p>
      {rules.map((r, i) => (
        <div key={i} className="set-row" style={{ alignItems: "center" }}>
          <span style={{ fontSize: "var(--text-sm)" }}>
            <b>WHEN</b> {r.when}{r.iff !== "—" ? <> · <b>IF</b> {r.iff}</> : null} · <b>THEN</b> {r.then}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className={`switch ${r.on ? "on" : ""}`} role="switch" aria-checked={r.on} aria-label={`Rule ${i + 1}`}
              onClick={() => setRules(rules.map((x, j) => j === i ? { ...x, on: !x.on } : x))}><span className="knob" /></button>
            <button className="btn ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
          </span>
        </div>
      ))}
      <div className="card card-pad" style={{ display: "grid", gap: 10 }}>
        <b>New rule</b>
        <div className="field"><label htmlFor="au-when">WHEN</label>
          <select id="au-when" className="input" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })}>
            {WHENS.map((w) => <option key={w}>{w}</option>)}</select></div>
        <div className="field"><label htmlFor="au-if">IF</label>
          <select id="au-if" className="input" value={draft.iff} onChange={(e) => setDraft({ ...draft, iff: e.target.value })}>
            {IFFS.map((w) => <option key={w}>{w}</option>)}</select></div>
        <div className="field"><label htmlFor="au-then">THEN</label>
          <select id="au-then" className="input" value={draft.then} onChange={(e) => setDraft({ ...draft, then: e.target.value })}>
            {THENS.map((w) => <option key={w}>{w}</option>)}</select></div>
        <div><button className="btn" onClick={() => setRules([...rules, draft])}>Add rule</button></div>
      </div>
    </div>
  );
}

/* ---- Privacy & Security (with change history) --------------------------------------------- */

export function PrivacySection() {
  useSettingsTick();
  const audit = readAudit();
  return (
    <div className="set-list">
      <div className="set-row">
        <div className="set-meta">
          <b>Sign-in security</b>
          <p className="sub">Password change, authenticator apps, active sessions and trusted devices are managed through your identity provider in live mode.</p>
        </div>
        <div className="set-control" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary">Change password</button>
          <button className="btn secondary">Sign out everywhere</button>
        </div>
      </div>
      <GenericSection slug="privacy" />

      <h3 className="set-h">Change history</h3>
      <p className="sub">Every settings change: who, what, previous → new value. Clinical records are never silently overwritten anywhere in Summit.</p>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Setting</th><th>Change</th><th>Level</th><th>Who</th><th>When</th><th aria-label="Restore" /></tr></thead>
          <tbody>
            {audit.slice(0, 15).map((e, i) => (
              <tr key={i}>
                <td><b>{e.label}</b></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{String(e.previous ?? "default")} → {String(e.next ?? "default")}</td>
                <td><span className="pill neutral">{e.level}</span></td>
                <td>{e.who}</td>
                <td className="trend">{e.at.slice(0, 16).replace("T", " ")}</td>
                <td><button className="btn ghost" onClick={() => restore(e)}>Restore previous</button></td>
              </tr>
            ))}
            {!audit.length ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No changes yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Email ---------------------------------------------------------------------------------- */

export function EmailSection() {
  const [connected, setConnected] = useJsonPref<string | null>("summit-email-account", null);
  return (
    <div className="set-list">
      <div className="set-row">
        <div className="set-meta">
          <b>Connected account</b>
          <p className="sub">{connected ? <><b>{connected}</b> · Status: Connected</> : "No email account connected. Microsoft 365, Google Workspace and SMTP are supported."}</p>
        </div>
        <div className="set-control" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connected ? (
            <>
              <button className="btn secondary" onClick={() => setConnected(null)}>Disconnect</button>
              <button className="btn secondary">Test connection</button>
            </>
          ) : (
            <button className="btn" onClick={() => setConnected("you@yourclinic.com (preview)")}>Connect</button>
          )}
        </div>
      </div>
      <GenericSection slug="email" />
    </div>
  );
}
