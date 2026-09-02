"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getSetting, onSettingsChange, setSetting, SETTINGS } from "@summit/settings";
import { HUB_TASKS } from "@/lib/content";
import { directory, hr } from "@/lib/hr-store";
import {
  decideTimeOff, getAudit, issueOnboardingCertificate, listPendingCertificatesToIssue,
  listPendingPdVerifications, listPendingSignoffs, listPendingTimeOffRequests, listTeamDirectory,
  signOffTask, verifyPd,
  type PendingCertificate, type PendingPd, type PendingSignoff, type PendingTimeOff, type TeamMember,
} from "@/lib/hub";
import { deactivateTeammate, editTeammate, inviteTeammate, ProvisioningError } from "@/lib/hr-backend";
import { SessionGate, useIdentity } from "@/components/session-provider";

/**
 * Admin: the supervisor and admin console with team directory, pending sign-off
 * queue, time-off decisions, PD verification and the audit feed. Admins see
 * the whole clinic; supervisors see their linked team (enforced by RLS in
 * live mode; the preview store holds one employee). Schedulers also reach
 * this console (2026-08-31), scoped clinic-wide the same as admin - see
 * migration 0022's widened hub_can_manage().
 */
export default function AdminPage() {
  // No HrGate `requires` here: scheduler maps to EMPLOYEE in this portal's
  // three-tier HubRole ladder (session.ts) everywhere else, on purpose - it
  // isn't promoted to SUPERVISOR app-wide just to reach this one screen.
  // AdminAccessGate below checks the raw appRole instead, so the exception
  // stays scoped to the Admin console specifically.
  return (
    <HrGate>
      <AdminAccessGate>
        <AdminConsole />
      </AdminAccessGate>
    </HrGate>
  );
}

function AdminAccessGate({ children }: { children: React.ReactNode }) {
  // Gate on profiles.role via RLS-backed identity, not on a role the browser
  // holds. The previous check read a role out of localStorage that My Profile
  // let anyone set, so any signed-in employee could open this console.
  const identity = useIdentity();
  const allowed = identity.role === "ADMIN" || identity.role === "SUPERVISOR" || identity.appRole === "scheduler";
  if (!allowed) {
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">Not available to you</h1>
        <p className="sub" style={{ marginTop: 8 }}>This area is for admin, supervisor and scheduler accounts.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Every queue on this screen used to read the CALLER's own loaded hub
 * snapshot (getProgress()/getPd()/getTimeOff()/getProfile()) instead of the
 * clinic's - see CLAUDE.md's "Admin console... scoped to the wrong user"
 * note. All five queues below (team directory, sign-offs, certificates,
 * time-off, PD) now fetch separately from a clinic-wide query
 * (lib/hub-backend.ts's listTeamDirectory()/listPendingSignoffs()/
 * listPendingCertificatesToIssue()/listPendingTimeOffRequests()/
 * listPendingPdVerifications(), all relying on RLS - no user_id filter) and
 * join the result against directory() for names, the same pattern
 * "Pending sign-offs" already used before this change. hub_pd_records and
 * hub_time_off_requests needed a new manage-scoped SELECT policy first
 * (migration 0041, not yet applied live) - hub_certificates and
 * hub_task_progress already had one from migration 0006.
 */
type QueueState<T> = { rows: T[] | null; error: string | null };

function useManagedQueue<T>(load: () => Promise<T[]>): [QueueState<T>, () => void] {
  const [state, setState] = React.useState<QueueState<T>>({ rows: null, error: null });
  const reload = React.useCallback(() => {
    load()
      .then((rows) => setState({ rows, error: null }))
      .catch((e: unknown) => setState({ rows: null, error: e instanceof Error ? e.message : String(e) }));
  }, [load]);
  React.useEffect(() => { reload(); }, [reload]);
  return [state, reload];
}

function AdminConsole() {
  const identity = useIdentity();
  const [ready, setReady] = React.useState(false);
  const [tab, setTab] = React.useState<"queues" | "staff" | "settings">("queues");

  const [signoffs, reloadSignoffs] = useManagedQueue<PendingSignoff>(listPendingSignoffs);
  const [certs, reloadCerts] = useManagedQueue<PendingCertificate>(listPendingCertificatesToIssue);
  const [timeOff, reloadTimeOff] = useManagedQueue<PendingTimeOff>(listPendingTimeOffRequests);
  const [pd, reloadPd] = useManagedQueue<PendingPd>(listPendingPdVerifications);
  const [team, reloadTeam] = useManagedQueue<TeamMember>(listTeamDirectory);

  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading admin…</p>;

  // Every screen this console gates on the role from identity, never a stored
  // hub record - see AdminAccessGate above.
  const role = identity.role;

  if (tab !== "queues") {
    return (
      <div>
        <AdminTabs tab={tab} setTab={setTab} role={role} />
        {tab === "staff" ? <StaffTab isAdmin={role === "ADMIN"} isPreview={identity.isPreview} /> : <BackendSettingsTab />}
      </div>
    );
  }

  const peopleById = new Map(directory().map((p) => [p.id, p]));
  const nameOf = (userId: string) => peopleById.get(userId)?.name ?? "Unknown employee";
  const pendingSignoffs = (signoffs.rows ?? []).map((p) => ({
    ...p, task: HUB_TASKS.find((t) => t.key === p.taskKey),
  }));

  return (
    <div>
      <AdminTabs tab={tab} setTab={setTab} role={role} />
      <p className="sub">
        {/* Scheduler's hub_can_manage() grant (migration 0022) is
            unconditional, same as admin's - clinic-wide, not team-linked -
            so it reads the copy the same way admin does. */}
        {role === "ADMIN" || identity.appRole === "scheduler" ? "Whole-clinic view." : "Your linked team."} Pending approvals first; everything you decide is audited.
      </p>

      <h2 className="section-title">Team directory</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Employee</th><th>#</th><th>Role / title</th><th>Location</th><th>VSC</th><th>Start</th><th>Onboarding</th><th>Training due</th></tr></thead>
          <tbody>
            {team.error ? (
              <tr><td colSpan={8} role="alert" style={{ color: "var(--danger, #b3261e)" }}>
                Could not load the team directory. {team.error}{" "}
                <button className="btn ghost" style={{ padding: "2px 8px" }} onClick={reloadTeam}>Try again</button>
              </td></tr>
            ) : team.rows === null ? (
              <tr><td colSpan={8} style={{ color: "var(--muted)" }}>Loading…</td></tr>
            ) : team.rows.length ? team.rows.map((m) => (
              <tr key={m.userId}>
                <td><b>{nameOf(m.userId)}</b></td>
                <td>{m.employeeNumber || "—"}</td>
                <td>{m.jobTitle ?? "—"}</td>
                <td>{m.location ?? "—"}</td>
                <td><span className={`pill ${m.vscStatus === "CLEARED" ? "good" : "warn"}`}>{m.vscStatus.replace(/_/g, " ").toLowerCase()}</span></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.startDate ?? "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.onboardingPercent}%</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.trainingDue}</td>
              </tr>
            )) : (
              <tr><td colSpan={8} style={{ color: "var(--muted)" }}>No accounts found for this clinic.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 6 }}>
        Everyone in your clinic with a Summit account and a clinic assigned. Someone missing here has no
        <code> profiles.clinic_id</code> set.
      </p>

      <h2 className="section-title">Pending sign-offs {pendingSignoffs.length ? <span className="pill warn">{pendingSignoffs.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {signoffs.error ? (
          <div className="card card-pad" role="alert" style={{ borderColor: "var(--danger, #b3261e)" }}>
            <b>Could not load pending sign-offs.</b> <span className="sub">{signoffs.error}</span>
            <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={reloadSignoffs}>Try again</button>
          </div>
        ) : signoffs.rows === null ? (
          <div className="card card-pad"><p className="sub">Loading pending sign-offs…</p></div>
        ) : (
          <>
            {pendingSignoffs.map((p) => (
              <div key={`${p.userId}-${p.taskKey}`} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: "var(--text-sm)" }}>{p.task?.title ?? p.taskKey}</b>
                  <p className="trend" style={{ marginTop: 4 }}>
                    {nameOf(p.userId)} · Week {p.task?.week} · {p.task?.section}{p.notes ? ` · note: ${p.notes}` : ""}
                  </p>
                </div>
                <button className="btn" onClick={() => void signOffTask(p.taskKey, p.userId).then(reloadSignoffs)}>Sign off as completed</button>
              </div>
            ))}
            {!pendingSignoffs.length ? <div className="card card-pad"><p className="sub">Nothing awaiting sign-off.</p></div> : null}
          </>
        )}
      </div>

      <h2 className="section-title">Certificates to issue {certs.rows?.length ? <span className="pill warn">{certs.rows.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {certs.error ? (
          <div className="card card-pad" role="alert" style={{ borderColor: "var(--danger, #b3261e)" }}>
            <b>Could not load certificates to issue.</b> <span className="sub">{certs.error}</span>
            <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={reloadCerts}>Try again</button>
          </div>
        ) : certs.rows === null ? (
          <div className="card card-pad"><p className="sub">Loading…</p></div>
        ) : (
          <>
            {certs.rows.map((c) => (
              <div key={`${c.userId}-${c.title}`} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: "var(--text-sm)" }}>{c.title}</b>
                  <p className="trend" style={{ marginTop: 4 }}>{nameOf(c.userId)} · {c.competency} · earned, awaiting issue</p>
                </div>
                <button className="btn" onClick={() => void issueOnboardingCertificate(c.title, c.competency, c.userId).then(reloadCerts)}>
                  Issue certificate
                </button>
              </div>
            ))}
            {!certs.rows.length ? <div className="card card-pad"><p className="sub">No certificates waiting to be issued.</p></div> : null}
          </>
        )}
      </div>

      <h2 className="section-title">Time-off requests {timeOff.rows?.length ? <span className="pill warn">{timeOff.rows.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {timeOff.error ? (
          <div className="card card-pad" role="alert" style={{ borderColor: "var(--danger, #b3261e)" }}>
            <b>Could not load time-off requests.</b> <span className="sub">{timeOff.error}</span>
            <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={reloadTimeOff}>Try again</button>
          </div>
        ) : timeOff.rows === null ? (
          <div className="card card-pad"><p className="sub">Loading…</p></div>
        ) : (
          <>
            {timeOff.rows.map((r) => (
              <div key={r.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>
                  <b>{nameOf(r.userId)}</b> · {r.type === "VACATION" ? "Vacation" : "Sick"} · {r.startDate} → {r.endDate} ({r.days}d){r.note ? ` · ${r.note}` : ""}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => void decideTimeOff(r.id, "APPROVED").then(reloadTimeOff)}>Approve</button>
                  <button className="btn secondary" onClick={() => void decideTimeOff(r.id, "DENIED").then(reloadTimeOff)}>Deny</button>
                </span>
              </div>
            ))}
            {!timeOff.rows.length ? <div className="card card-pad"><p className="sub">No pending requests.</p></div> : null}
          </>
        )}
      </div>

      <h2 className="section-title">PD awaiting verification {pd.rows?.length ? <span className="pill warn">{pd.rows.length}</span> : null}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pd.error ? (
          <div className="card card-pad" role="alert" style={{ borderColor: "var(--danger, #b3261e)" }}>
            <b>Could not load PD awaiting verification.</b> <span className="sub">{pd.error}</span>
            <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={reloadPd}>Try again</button>
          </div>
        ) : pd.rows === null ? (
          <div className="card card-pad"><p className="sub">Loading…</p></div>
        ) : (
          <>
            {pd.rows.map((r) => (
              <div key={r.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--text-sm)" }}><b>{nameOf(r.userId)}</b> · {r.title} · {r.provider || "—"} · {r.hours}h · {r.date}</span>
                <button className="btn secondary" onClick={() => void verifyPd(r.id).then(reloadPd)}>Verify</button>
              </div>
            ))}
            {!pd.rows.length ? <div className="card card-pad"><p className="sub">All PD entries are verified.</p></div> : null}
          </>
        )}
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
 * the directory now shows who actually has an account. Provisioning (2026-08-28)
 * is a platform capability beside auth - the invite-teammate / edit-teammate
 * Supabase Edge Functions in supabase/functions/ - not this tab's own code;
 * this only calls them (lib/hr-backend.ts's inviteTeammate/editTeammate/
 * deactivateTeammate).
 *
 * Only admin/supervisor/clinician roles are offered here: this directory's
 * ACCESS map (hr-backend.ts) only knows how to label those three correctly -
 * a scheduler or client account would show up mislabeled "employee". Admin
 * can invite a scheduler, or a client onto an existing intake record, from
 * apps/scheduler's admin page instead, next to where that data actually lives.
 */
function StaffTab({ isAdmin, isPreview }: { isAdmin: boolean; isPreview: boolean }) {
  const people = directory();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deactivated, setDeactivated] = React.useState<Set<string>>(new Set());
  const visiblePeople = people.filter((p) => !deactivated.has(p.id));

  return (
    <div style={{ marginTop: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Clinic directory</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th><th>Access</th><th>Supervisor</th>
              {isAdmin ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {visiblePeople.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b></td>
                <td><span className="pill">{m.accessLevel.toLowerCase()}</span></td>
                <td>{visiblePeople.find((x) => x.id === m.supervisorId)?.name ?? "—"}</td>
                {isAdmin ? (
                  <td>
                    <TeammateActions
                      person={m}
                      people={visiblePeople}
                      busy={busyId === m.id}
                      onBusy={(b) => setBusyId(b ? m.id : null)}
                      onDone={(text) => setNotice({ kind: "ok", text })}
                      onError={(text) => setNotice({ kind: "err", text })}
                      onDeactivated={() => setDeactivated((s) => new Set(s).add(m.id))}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {!visiblePeople.length ? (
              <tr><td colSpan={isAdmin ? 4 : 3} style={{ color: "var(--muted)" }}>
                No accounts found for this clinic.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {notice ? (
        <p className="sub" style={{ marginTop: 10, color: notice.kind === "err" ? "var(--danger, #b3261e)" : "var(--muted)" }}>
          {notice.text}
        </p>
      ) : null}

      {isAdmin && !isPreview ? (
        <InviteForm people={people} onDone={(text) => setNotice({ kind: "ok", text })} onError={(text) => setNotice({ kind: "err", text })} />
      ) : (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <b style={{ fontSize: "var(--text-sm)" }}>Adding someone</b>
          <p className="sub" style={{ marginTop: 6 }}>
            Everyone here has a Summit account. Recognition, peer review and scorecards all record who did what
            against that account, so a person has to exist before they can appear in them.
          </p>
          <p className="sub" style={{ marginTop: 6 }}>
            {isPreview
              ? "Invites are disabled in preview - there is no real account to send one to."
              : "Only an admin can invite someone from here. A scheduler can invite a client or clinician from the scheduler's admin page."}
          </p>
        </div>
      )}
    </div>
  );
}

const INVITE_ROLES = ["admin", "supervisor", "clinician"] as const;

function InviteForm({
  people, onDone, onError,
}: { people: ReturnType<typeof directory>; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<(typeof INVITE_ROLES)[number]>("clinician");
  const [supervisorId, setSupervisorId] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function send() {
    if (!email.trim()) return;
    setSending(true);
    try {
      await inviteTeammate({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role,
        supervisorId: role === "clinician" && supervisorId ? supervisorId : undefined,
      });
      onDone(`Invite sent to ${email.trim()}.`);
      setEmail("");
      setFullName("");
      setSupervisorId("");
    } catch (e) {
      onError(e instanceof ProvisioningError ? e.message : "Could not send the invite.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <b style={{ fontSize: "var(--text-sm)" }}>Invite a teammate</b>
      {/* Real labels, not placeholders. A placeholder is not an accessible name
          and it disappears the moment someone types, so a screen reader gets
          nothing and a sighted person loses the only clue what the field was.
          `.input` from components.css replaces four inline borders that read
          `var(--border, #ccc)` — `--border` is not a token in this design
          system, so every one of them resolved to that hardcoded grey and
          ignored the palette, including in dark mode. */}
      <label htmlFor="inv-name" className="sub">Full name</label>
      <input
        id="inv-name" type="text" className="input" autoComplete="name"
        placeholder="Full name" value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <label htmlFor="inv-email" className="sub">Email address</label>
      <input
        id="inv-email" type="email" className="input" autoComplete="email"
        placeholder="name@example.com" value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor="inv-role" className="sub">Role</label>
      <select id="inv-role" className="input" value={role}
        onChange={(e) => setRole(e.target.value as (typeof INVITE_ROLES)[number])}>
        {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {role === "clinician" ? (
        <>
          <label htmlFor="inv-supervisor" className="sub">Supervisor</label>
          <select id="inv-supervisor" className="input" value={supervisorId}
            onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="">No supervisor yet</option>
            {people.filter((p) => p.accessLevel === "SUPERVISOR" || p.accessLevel === "ADMIN").map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </>
      ) : null}
      <button onClick={send} disabled={sending || !email.trim()} className="btn" style={{ alignSelf: "flex-start" }}>
        {sending ? "Sending…" : "Send invite"}
      </button>
    </div>
  );
}

function TeammateActions({
  person, people, busy, onBusy, onDone, onError, onDeactivated,
}: {
  person: ReturnType<typeof directory>[number];
  people: ReturnType<typeof directory>;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
  onDeactivated: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [role, setRole] = React.useState(person.accessLevel.toLowerCase());
  const [supervisorId, setSupervisorId] = React.useState(person.supervisorId ?? "");

  async function saveEdit() {
    onBusy(true);
    try {
      await editTeammate({
        targetUserId: person.id,
        role: role as EditTeammateRole,
        supervisorId: supervisorId || null,
      });
      onDone(`Updated ${person.name}.`);
      setEditing(false);
    } catch (e) {
      onError(e instanceof ProvisioningError ? e.message : "Could not save the change.");
    } finally {
      onBusy(false);
    }
  }

  async function deactivate() {
    if (!confirm(`Deactivate ${person.name}? They will no longer be able to sign in.`)) return;
    onBusy(true);
    try {
      const res = await deactivateTeammate(person.id);
      onDone(res.warning ? `${person.name} deactivated. ${res.warning}.` : `${person.name} deactivated.`);
      onDeactivated();
    } catch (e) {
      onError(e instanceof ProvisioningError ? e.message : "Could not deactivate.");
    } finally {
      onBusy(false);
    }
  }

  // One row per person, so every control here repeats down the table. Without
  // the person's name in the accessible name, a screen reader announces "Edit
  // button" a dozen times with nothing to tell them apart. The visible text
  // stays short because the row it sits in supplies that context visually.
  if (!editing) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setEditing(true)} disabled={busy} className="btn secondary"
          aria-label={`Edit ${person.name}`}>Edit</button>
        <button onClick={deactivate} disabled={busy} className="btn secondary"
          aria-label={`Deactivate ${person.name}`}>Deactivate</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select className="input" style={{ width: "auto" }} value={role}
        aria-label={`Role for ${person.name}`}
        onChange={(e) => setRole(e.target.value)}>
        {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {role === "clinician" ? (
        <select className="input" style={{ width: "auto" }} value={supervisorId}
          aria-label={`Supervisor for ${person.name}`}
          onChange={(e) => setSupervisorId(e.target.value)}>
          <option value="">No supervisor</option>
          {people.filter((p) => p.id !== person.id && (p.accessLevel === "SUPERVISOR" || p.accessLevel === "ADMIN")).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : null}
      <button onClick={saveEdit} disabled={busy} className="btn"
        aria-label={`Save changes to ${person.name}`}>Save</button>
      <button onClick={() => setEditing(false)} disabled={busy} className="btn secondary"
        aria-label={`Cancel editing ${person.name}`}>Cancel</button>
    </div>
  );
}

type EditTeammateRole = "admin" | "supervisor" | "clinician" | "scheduler" | "client";

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