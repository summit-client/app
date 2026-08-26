"use client";

import * as React from "react";
import { getSetting, onSettingsChange, setSetting, SETTINGS } from "@summit/settings";
import { HUB_TASKS } from "@/lib/content";
import { hr, hrAudit, saveHr, type StaffMember } from "@/lib/hr-store";
import {
  decideTimeOff, getAudit, getPd, getProfile, getProgress, getTimeOff, getTraining,
  onboardingProgress, signOffTask, verifyPd,
} from "@/lib/hub";

/**
 * Admin: the supervisor and admin console with team directory, pending sign-off
 * queue, time-off decisions, PD verification and the audit feed. Admins see
 * the whole clinic; supervisors see their linked team (enforced by RLS in
 * live mode; the preview store holds one employee).
 */
export default function AdminPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = React.useState<"queues" | "staff" | "settings">("queues");
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading admin…</p>;

  const profile = getProfile();
  if (profile.role === "EMPLOYEE") {
    return (
      <div>
        <h1 className="h-page">Admin</h1>
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="sub">This area is for supervisors and administrators. In preview, switch your role from My Profile to demo it.</p>
        </div>
      </div>
    );
  }

  if (tab !== "queues") {
    return (
      <div>
        <AdminTabs tab={tab} setTab={setTab} role={profile.role} />
        {tab === "staff" ? <StaffTab onChange={force} /> : <BackendSettingsTab />}
      </div>
    );
  }

  const progress = getProgress();
  const ob = onboardingProgress(progress);
  const pendingSignoffs = progress
    .filter((p) => p.status === "AWAITING_SIGNOFF")
    .map((p) => ({ ...p, task: HUB_TASKS.find((t) => t.key === p.taskKey) }));
  const pendingTimeOff = getTimeOff().filter((r) => r.status === "REQUESTED");
  const unverifiedPd = getPd().filter((r) => !r.verified);
  const trainingDue = (() => {
    const done = new Set(getTraining().filter((t) => t.status === "COMPLETED").map((t) => t.courseKey));
    return HUB_TASKS.filter((t) => t.courseKey && !done.has(t.courseKey)).length;
  })();

  return (
    <div>
      <AdminTabs tab={tab} setTab={setTab} role={profile.role} />
      <p className="sub">
        {profile.role === "ADMIN" ? "Whole-clinic view." : "Your linked team."} Pending approvals first; everything you decide is audited.
      </p>

      <h2 className="section-title">Team directory</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Employee</th><th>#</th><th>Role / title</th><th>Location</th><th>VSC</th><th>Start</th><th>Onboarding</th><th>Training due</th></tr></thead>
          <tbody>
            <tr>
              <td><b>{profile.name}</b></td>
              <td>{profile.employeeNumber}</td>
              <td>{profile.jobTitle ?? "—"}</td>
              <td>{profile.location ?? "—"}</td>
              <td><span className={`pill ${profile.vscStatus === "CLEARED" ? "good" : "warn"}`}>{profile.vscStatus.replace(/_/g, " ").toLowerCase()}</span></td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{profile.startDate ?? "—"}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{ob.percent}%</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{trainingDue}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 6 }}>Preview holds one employee; live mode lists every active team member in your scope.</p>

      <h2 className="section-title">Pending sign-offs {pendingSignoffs.length ? <span className="pill warn">{pendingSignoffs.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendingSignoffs.map((p) => (
          <div key={p.taskKey} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: "var(--text-sm)" }}>{p.task?.title ?? p.taskKey}</b>
              <p className="trend" style={{ marginTop: 4 }}>{profile.name} · Week {p.task?.week} · {p.task?.section}{p.notes ? ` · note: ${p.notes}` : ""}</p>
            </div>
            <button className="btn" onClick={() => void signOffTask(p.taskKey).then(force)}>Sign off as completed</button>
          </div>
        ))}
        {!pendingSignoffs.length ? <div className="card card-pad"><p className="sub">Nothing awaiting sign-off.</p></div> : null}
      </div>

      <h2 className="section-title">Time-off requests {pendingTimeOff.length ? <span className="pill warn">{pendingTimeOff.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendingTimeOff.map((r) => (
          <div key={r.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)" }}>
              <b>{profile.name}</b> · {r.type === "VACATION" ? "Vacation" : "Sick"} · {r.startDate} → {r.endDate} ({r.days}d){r.note ? ` · ${r.note}` : ""}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => void decideTimeOff(r.id, "APPROVED").then(force)}>Approve</button>
              <button className="btn secondary" onClick={() => void decideTimeOff(r.id, "DENIED").then(force)}>Deny</button>
            </span>
          </div>
        ))}
        {!pendingTimeOff.length ? <div className="card card-pad"><p className="sub">No pending requests.</p></div> : null}
      </div>

      <h2 className="section-title">PD awaiting verification {unverifiedPd.length ? <span className="pill warn">{unverifiedPd.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {unverifiedPd.map((r) => (
          <div key={r.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)" }}><b>{r.title}</b> · {r.provider || "—"} · {r.hours}h · {r.date}</span>
            <button className="btn secondary" onClick={() => void verifyPd(r.id).then(force)}>Verify</button>
          </div>
        ))}
        {!unverifiedPd.length ? <div className="card card-pad"><p className="sub">All PD entries are verified.</p></div> : null}
      </div>

      <h2 className="section-title">Recent activity</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Action</th><th>Detail</th><th>Who</th><th>When</th></tr></thead>
          <tbody>
            {getAudit().slice(0, 15).map((a) => (
              <tr key={a.id}>
                <td><span className="pill neutral">{a.action}</span></td>
                <td>{a.detail}</td>
                <td>{a.who}</td>
                <td className="trend">{a.at.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
            {!getAudit().length ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No activity yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function AdminTabs({ tab, setTab, role }: { tab: string; setTab: (t: "queues" | "staff" | "settings") => void; role: string }) {
  return (
    <>
      <h1 className="h-page">Admin</h1>
      <div className="mode-tabs" style={{ marginTop: 10 }} role="tablist" aria-label="Admin sections">
        {([["queues", "Queues"], ["staff", "Staff & Teams"], ["settings", "Backend Settings"]] as const).map(([k, label]) => (
          (k !== "settings" || role === "ADMIN") ? (
            <button key={k} role="tab" aria-selected={tab === k} className={`mode-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
          ) : null
        ))}
      </div>
    </>
  );
}

const PERMISSION_KEYS = ["Onboarding", "Training", "Credentials", "Scorecards", "Recognition", "Policies", "Documents", "Reports"];
const ACCESS_LEVELS = ["EMPLOYEE", "SUPERVISOR", "ADMIN"] as const;

/**
 * Staff & Teams. The one writer of the staff registry: everything else (peer
 * group, recognition, reviews) reads from it. Adding a person here is what
 * puts them in the ecosystem.
 */
function StaffTab({ onChange }: { onChange: () => void }) {
  const s = hr();
  const [f, setF] = React.useState({ name: "", email: "", employeeNumber: "", role: "Supervised Clinician", team: "Clinical Services", site: "", accessLevel: "EMPLOYEE" as StaffMember["accessLevel"], supervisor: "" });
  const [editing, setEditing] = React.useState<string | null>(null);

  const add = () => {
    s.team.push({ ...f, permissions: [], status: "INVITED" });
    saveHr();
    hrAudit("staff.added", `${f.name} (${f.role}, ${f.accessLevel})`);
    setF({ ...f, name: "", email: "", employeeNumber: "" });
    onChange();
  };
  const patch = (name: string, changes: Partial<StaffMember>) => {
    const m = s.team.find((x) => x.name === name);
    if (!m) return;
    Object.assign(m, changes);
    saveHr();
    hrAudit("staff.updated", `${name}: ${Object.keys(changes).join(", ")}`);
    onChange();
  };
  const togglePermission = (name: string, key: string) => {
    const m = s.team.find((x) => x.name === name);
    if (!m) return;
    m.permissions = m.permissions?.includes(key) ? m.permissions.filter((p) => p !== key) : [...(m.permissions ?? []), key];
    saveHr();
    hrAudit("staff.permissions", `${name}: ${key}`);
    onChange();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Add staff</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 180 }}><label htmlFor="st-name">Name</label>
            <input id="st-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field" style={{ minWidth: 200 }}><label htmlFor="st-email">Email</label>
            <input id="st-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field" style={{ width: 130 }}><label htmlFor="st-num">Employee #</label>
            <input id="st-num" className="input" value={f.employeeNumber} onChange={(e) => setF({ ...f, employeeNumber: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="st-role">Role</label>
            <input id="st-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></div>
          <div className="field"><label htmlFor="st-team">Team</label>
            <input id="st-team" className="input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></div>
          <div className="field"><label htmlFor="st-site">Site</label>
            <input id="st-site" className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="e.g. Bowmanville" /></div>
          <div className="field"><label htmlFor="st-access">Access</label>
            <select id="st-access" className="input" value={f.accessLevel} onChange={(e) => setF({ ...f, accessLevel: e.target.value as StaffMember["accessLevel"] })}>
              {ACCESS_LEVELS.map((a) => <option key={a} value={a}>{a.toLowerCase()}</option>)}
            </select></div>
          <div className="field"><label htmlFor="st-sup">Supervisor</label>
            <input id="st-sup" className="input" list="supervisors" value={f.supervisor} onChange={(e) => setF({ ...f, supervisor: e.target.value })} />
            <datalist id="supervisors">{s.team.filter((m) => m.accessLevel !== "EMPLOYEE").map((m) => <option key={m.name} value={m.name} />)}</datalist></div>
        </div>
        <div><button className="btn" onClick={add} disabled={!f.name.trim()}>Add staff member</button></div>
      </div>

      <h2 className="section-title">Staff</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Site</th><th>Access</th><th>Supervisor</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {s.team.map((m) => (
              <tr key={m.name}>
                <td><b>{m.name}</b>{m.email ? <div className="trend">{m.email}</div> : null}</td>
                <td>{m.role}</td>
                <td>
                  <input className="input" style={{ width: 140, padding: "4px 8px" }} value={m.team} aria-label={`Team for ${m.name}`}
                    onChange={(e) => patch(m.name, { team: e.target.value })} />
                </td>
                <td>{m.site ?? "—"}</td>
                <td>
                  <select className="input" style={{ width: "auto", padding: "4px 8px" }} value={m.accessLevel ?? "EMPLOYEE"} aria-label={`Access for ${m.name}`}
                    onChange={(e) => patch(m.name, { accessLevel: e.target.value as StaffMember["accessLevel"] })}>
                    {ACCESS_LEVELS.map((a) => <option key={a} value={a}>{a.toLowerCase()}</option>)}
                  </select>
                </td>
                <td>
                  <input className="input" style={{ width: 130, padding: "4px 8px" }} value={m.supervisor ?? ""} aria-label={`Supervisor for ${m.name}`}
                    onChange={(e) => patch(m.name, { supervisor: e.target.value })} />
                </td>
                <td><span className={`pill ${m.status === "ACTIVE" ? "good" : m.status === "DISABLED" ? "danger" : "warn"}`}>{(m.status ?? "ACTIVE").toLowerCase()}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost" onClick={() => setEditing(editing === m.name ? null : m.name)}>Permissions</button>
                  <button className="btn ghost" onClick={() => patch(m.name, { status: m.status === "DISABLED" ? "ACTIVE" : "DISABLED" })}>
                    {m.status === "DISABLED" ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
            {!s.team.length ? <tr><td colSpan={8} style={{ color: "var(--muted)" }}>No staff yet. Add the first person above.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <b style={{ fontSize: "var(--text-sm)" }}>Manage permissions for {editing}</b>
          <p className="sub">What this person may manage beyond their own records. Access level controls the portal views; these refine module rights.</p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            {PERMISSION_KEYS.map((k) => {
              const on = s.team.find((x) => x.name === editing)?.permissions?.includes(k);
              return (
                <button key={k} className={`mode-tab ${on ? "active" : ""}`} aria-pressed={on} onClick={() => togglePermission(editing, k)}>
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="sub" style={{ marginTop: 10 }}>
        In live mode, adding staff sends a Summit invitation and these rows live in profiles with RLS. This registry is
        the one source the peer group, reviews and recognition read from.
      </p>
    </div>
  );
}

/**
 * Backend settings: the Ecosystem Tracker configuration, edited on the same
 * central settings service the Summit Settings hub uses. A change here is a
 * change there, one store, no divergence.
 */
function BackendSettingsTab() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onSettingsChange(() => force()), []);
  const defs = SETTINGS.filter((d) => d.section === "ecosystem");

  return (
    <div style={{ marginTop: 16 }}>
      <p className="sub" style={{ maxWidth: "68ch", marginTop: 0 }}>
        Organization settings for this module, on the same central settings service as the Summit Settings hub. Every
        change is audited with its previous value.
      </p>
      <div className="attn" style={{ marginTop: 12 }}>
        {defs.map((d) => {
          const value = getSetting(d.key);
          return (
            <div key={d.key}>
              <span style={{ maxWidth: "46ch" }}>
                {d.label}
                {d.description ? <div className="trend">{d.description}</div> : null}
              </span>
              <span>
                {d.type === "toggle" ? (
                  <button className={`switch ${value === true ? "on" : ""}`} role="switch" aria-checked={value === true} aria-label={d.label}
                    onClick={() => setSetting(d.key, !(value === true), "org")}><span className="knob" /></button>
                ) : d.type === "number" ? (
                  <input type="number" className="input" style={{ width: 96 }} value={Number(value)} aria-label={d.label}
                    onChange={(e) => setSetting(d.key, Number(e.target.value) || 0, "org")} />
                ) : (
                  <input className="input" style={{ minWidth: 260 }} value={String(value)} aria-label={d.label}
                    onChange={(e) => setSetting(d.key, e.target.value, "org")} />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}