"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getSetting, onSettingsChange, setSetting, SETTINGS } from "@summit/settings";
import { HUB_TASKS } from "@/lib/content";
import { directory, hr } from "@/lib/hr-store";
import {
  decideTimeOff, getAudit, getPd, getProfile, getProgress, getTimeOff, getTraining,
  issueOnboardingCertificate, onboardingProgress, pendingOnboardingCertificates,
  signOffTask, verifyPd,
} from "@/lib/hub";
import { SessionGate, useIdentity } from "@/components/session-provider";

/**
 * Admin: the supervisor and admin console with team directory, pending sign-off
 * queue, time-off decisions, PD verification and the audit feed. Admins see
 * the whole clinic; supervisors see their linked team (enforced by RLS in
 * live mode; the preview store holds one employee).
 */
export default function AdminPage() {
  // Gate on profiles.role via RLS-backed identity, not on a role the browser
  // holds. The previous check read a role out of localStorage that My Profile
  // let anyone set, so any signed-in employee could open this console.
  return (
    <HrGate requires={["SUPERVISOR", "ADMIN"]}>
      <AdminConsole />
    </HrGate>
  );
}

function AdminConsole() {
  const identity = useIdentity();
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = React.useState<"queues" | "staff" | "settings">("queues");
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading admin…</p>;

  // The record on screen still comes from the hub store; only the ROLE that
  // decides what this console exposes comes from identity.
  const profile = { ...getProfile(), role: identity.role };

  if (tab !== "queues") {
    return (
      <div>
        <AdminTabs tab={tab} setTab={setTab} role={profile.role} />
        {tab === "staff" ? <StaffTab /> : <BackendSettingsTab />}
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
  // Onboarding certificates are no longer minted in the browser: nothing there
  // could verify they were earned, and the registry number came from a counter
  // in localStorage. Earned-but-unissued ones queue here for a supervisor.
  const pendingCerts = pendingOnboardingCertificates();

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
      <p className="sub" style={{ marginTop: 6 }}>
        Everyone in your clinic with a Summit account and a clinic assigned. Someone missing here has no
        <code> profiles.clinic_id</code> set.
      </p>

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

      <h2 className="section-title">Certificates to issue {pendingCerts.length ? <span className="pill warn">{pendingCerts.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendingCerts.map((c) => (
          <div key={c.title} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: "var(--text-sm)" }}>{c.title}</b>
              <p className="trend" style={{ marginTop: 4 }}>{profile.name} · {c.competency} · earned, awaiting issue</p>
            </div>
            <button className="btn" onClick={() => void issueOnboardingCertificate(c.title, c.competency).then(force)}>
              Issue certificate
            </button>
          </div>
        ))}
        {!pendingCerts.length ? <div className="card card-pad"><p className="sub">No certificates waiting to be issued.</p></div> : null}
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
 * Staff & Teams: the clinic directory, read from `profiles`.
 *
 * This used to be a form. Typing a name pushed a row into this browser's
 * localStorage and marked it "INVITED", and the note underneath claimed that
 * live mode "sends a Summit invitation and these rows live in profiles with
 * RLS". None of that existed - no account was created, no invitation sent, and
 * nobody else ever saw the entry.
 *
 * Recognition, peer review and the scoreboard all need a real auth user
 * (recognitions.to_user and scorecard_responses.rater are uuid references), so
 * the directory now shows who actually has an account, and says plainly what is
 * needed to add someone. Provisioning belongs beside auth as a platform
 * capability, not in this tab.
 */
function StaffTab() {
  const people = directory();

  return (
    <div style={{ marginTop: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Clinic directory</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Access</th><th>Supervisor</th></tr></thead>
          <tbody>
            {people.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b></td>
                <td><span className="pill">{m.accessLevel.toLowerCase()}</span></td>
                <td>{people.find((x) => x.id === m.supervisorId)?.name ?? "\u2014"}</td>
              </tr>
            ))}
            {!people.length ? (
              <tr><td colSpan={3} style={{ color: "var(--muted)" }}>
                No accounts found for this clinic.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>Adding someone</b>
        <p className="sub" style={{ marginTop: 6 }}>
          Everyone here has a Summit account. Recognition, peer review and scorecards all record who did what
          against that account, so a person has to exist before they can appear in them.
        </p>
        <p className="sub" style={{ marginTop: 6 }}>
          Accounts are created centrally for the whole platform, not from this tab \u2014 the same account signs
          into the scheduler and the clinician portal. Until self-serve invitations exist, an administrator
          creates the account and sets <code>profiles.clinic_id</code>, <code>role</code> and{" "}
          <code>supervisor_id</code>; the person then appears here automatically.
        </p>
      </div>
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