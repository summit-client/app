"use client";

import * as React from "react";
import Link from "next/link";
import { HUB_COURSES, HUB_TASKS } from "@/lib/content";
import {
  computeEntitlements, dueDate, getCertificates, getPd, getProfile, getProgress, getTimeOff,
  getTraining, onboardingProgress,
} from "@/lib/hub";

/** Dashboard — onboarding %, next task, training due, PD hours, certificates
 * and time-off balances, everything derived from the start date. */
export default function HubDashboard() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []); // store is client-side

  if (!ready) return <p className="sub">Loading your hub…</p>;

  const profile = getProfile();
  const progress = getProgress();
  const ob = onboardingProgress(progress);
  const training = getTraining();
  const doneCourses = new Set(training.filter((t) => t.status === "COMPLETED").map((t) => t.courseKey));
  const due = HUB_COURSES
    .filter((c) => (c.kind === "COMPLIANCE" || c.kind === "CLINICAL") && !doneCourses.has(c.key) && c.deadlineBucket !== "CUSTOM")
    .map((c) => ({ ...c, due: dueDate(profile.startDate, c.deadlineBucket) }))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
    .slice(0, 6);
  const pdHours = getPd().reduce((s, r) => s + r.hours, 0);
  const certs = getCertificates().length;
  const ent = profile.startDate ? computeEntitlements(profile.startDate, getTimeOff()) : null;

  return (
    <div>
      <h1 className="h-page">Welcome, {profile.name.split(" ")[0]}</h1>
      <p className="sub">
        {profile.jobTitle ?? "Team member"} · {profile.employeeNumber}
        {profile.startDate ? <> · started {profile.startDate} — onboarding due {dueDate(profile.startDate, "WITHIN_14_DAYS")}</> : null}
      </p>

      <div className="tiles" style={{ marginTop: 20 }}>
        <Link href="/onboarding" className="card tile" style={{ textDecoration: "none" }}>
          <div className="n">{ob.percent}%</div><div className="l">Onboarding complete</div>
        </Link>
        <Link href="/training" className="card tile" style={{ textDecoration: "none" }}>
          <div className="n">{due.length}</div><div className="l">Trainings due</div>
        </Link>
        <Link href="/pd" className="card tile" style={{ textDecoration: "none" }}>
          <div className="n">{pdHours}</div><div className="l">PD hours</div>
        </Link>
        <Link href="/certificates" className="card tile" style={{ textDecoration: "none" }}>
          <div className="n">{certs}</div><div className="l">Certificates</div>
        </Link>
      </div>

      {ob.nextTask ? (
        <div className="card card-pad" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <b>Next up: {ob.nextTask.title}</b>
            <p className="sub">{ob.completed} of {ob.applicable} required items complete · Week {ob.nextTask.week} · {ob.nextTask.section}</p>
          </div>
          <Link href="/onboarding" className="btn" style={{ textDecoration: "none" }}>Open onboarding</Link>
        </div>
      ) : null}

      <h2 className="section-title">Training due</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Course</th><th>Provider</th><th>Kind</th><th>Due</th></tr></thead>
          <tbody>
            {due.map((c) => (
              <tr key={c.key}>
                <td><b>{c.title}</b></td>
                <td>{c.provider ?? "—"}</td>
                <td><span className={`pill ${c.kind === "COMPLIANCE" ? "warn" : "accent"}`}>{c.kind.toLowerCase()}</span></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.due ?? "—"}</td>
              </tr>
            ))}
            {!due.length ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>All assigned training is complete.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {ent ? (
        <>
          <h2 className="section-title">Time off</h2>
          <div className="tiles">
            <div className="card tile">
              <div className="n">{ent.vacation.remaining}</div>
              <div className="l">Vacation days left of {ent.vacation.entitled}</div>
            </div>
            <div className="card tile">
              <div className="n">{ent.sick.remaining}</div>
              <div className="l">Sick / mental-health days left of {ent.sick.entitled}</div>
            </div>
            <div className="card tile">
              <div className="n" style={{ fontSize: "var(--text-xl)" }}>{ent.nextReset}</div>
              <div className="l">Balances reset (anniversary)</div>
            </div>
          </div>
        </>
      ) : null}

      <p className="trend" style={{ marginTop: 18 }}>
        {HUB_TASKS.length} onboarding items · VSC status: <b>{profile.vscStatus.replace(/_/g, " ").toLowerCase()}</b>
      </p>
    </div>
  );
}
