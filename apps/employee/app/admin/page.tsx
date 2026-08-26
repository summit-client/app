"use client";

import * as React from "react";
import { HUB_TASKS } from "@/lib/content";
import {
  decideTimeOff, getAudit, getPd, getProfile, getProgress, getTimeOff, getTraining,
  onboardingProgress, signOffTask, verifyPd,
} from "@/lib/hub";

/**
 * Admin — the supervisor/admin console: team directory, pending sign-off
 * queue, time-off decisions, PD verification and the audit feed. Admins see
 * the whole clinic; supervisors see their linked team (enforced by RLS in
 * live mode; the preview store holds one employee).
 */
export default function AdminPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
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
      <h1 className="h-page">Admin</h1>
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
            <button className="btn" onClick={() => void signOffTask(p.taskKey).then(force)}>Sign off — completed</button>
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
