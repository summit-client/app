"use client";

import * as React from "react";
import Link from "next/link";
import { HUB_COURSES } from "@/lib/content";
import { dueDate, getCertificates, getProfile, getProgress, getTraining, onboardingProgress } from "@/lib/hub";
import { computeCompliance, maximizeMyCredits } from "@/lib/credentials";
import { computeBonus, computeEcosystem } from "@/lib/ecosystem";
import { currentCycle, hr } from "@/lib/hr-store";

/**
 * Overview. Answers five questions on one calm page: how am I doing, what
 * needs my attention, what am I working toward, what has my team shared, and
 * what is my next milestone.
 */
export default function OverviewPage() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading your overview…</p>;

  const profile = getProfile();
  const s = hr();
  const eco = computeEcosystem(s.responses);
  const ob = onboardingProgress(getProgress());
  const training = getTraining();
  const doneCourses = new Set(training.filter((t) => t.status === "COMPLETED").map((t) => t.courseKey));
  const trainingDue = HUB_COURSES.filter((c) => (c.kind === "COMPLIANCE" || c.kind === "CLINICAL") && !doneCourses.has(c.key) && c.deadlineBucket !== "CUSTOM");
  const trainingPct = HUB_COURSES.length ? Math.round((doneCourses.size / HUB_COURSES.filter((c) => c.deadlineBucket !== "CUSTOM").length) * 100) : 0;

  const compliances = s.credentials.map((c) => computeCompliance(c, s.allocations, s.activities)).filter((x): x is NonNullable<typeof x> => !!x);
  const primary = compliances[0] ?? null;
  const nextRenewal = [...s.credentials].sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd))[0] ?? null;
  const recogPoints = s.recognition.filter((r) => r.to === profile.name && r.date.slice(0, 7) === currentCycle()).reduce((n, r) => n + r.points, 0);

  const pendingAcks = s.policies.filter((p) => p.required && !s.acks.some((a) => a.policyId === p.id && a.version === p.version && a.acknowledgedAt));
  const openGoals = s.goals.filter((g) => g.status !== "MET");
  const maximize = maximizeMyCredits(compliances);

  const bonus = computeBonus({
    score: eco.score,
    trainingComplete: trainingDue.length === 0,
    documentationComplete: true,
    credentialCompliant: compliances.every((c) => c.remaining === 0 || new Date(c.credential.cycleEnd) > new Date(Date.now() + 90 * 86_400_000)),
    policiesAcknowledged: pendingAcks.length === 0,
  });

  return (
    <div>
      <h1 className="h-page">Overview</h1>
      <p className="sub">
        {profile.name} · {profile.jobTitle ?? "Team member"} · {profile.location ?? "Location not set"} · cycle {currentCycle()}
      </p>

      <div className="stat-row" style={{ marginTop: 8 }}>
        <div className="stat">
          <div className="v" style={{ color: "var(--accent)" }}>{eco.score ?? "—"}{eco.score != null ? " / 100" : ""}</div>
          <div className="k">Ecosystem Score</div>
          <div className="d sub" style={{ marginTop: 2 }}>{eco.score == null ? "No inputs submitted yet" : eco.strongestDomain ? `Strongest: ${eco.strongestDomain}` : ""}</div>
        </div>
        <div className="stat">
          <div className="v">{primary ? `${primary.totalCompleted} / ${primary.totalRequired}` : "—"}</div>
          <div className="k">{primary ? `${primary.rule.label} ${primary.rule.unit === "CPD_HOUR" ? "CPD hours" : primary.rule.unit + "s"}` : "Professional development"}</div>
        </div>
        <div className="stat">
          <div className="v">{trainingPct}%</div>
          <div className="k">Required training complete</div>
        </div>
        <div className="stat">
          <div className="v">{recogPoints > 0 ? `+${recogPoints}` : "0"}</div>
          <div className="k">Recognition points this month</div>
        </div>
        <div className="stat">
          <div className="v" style={{ fontSize: "var(--text-lg)" }}>{nextRenewal?.cycleEnd ?? "—"}</div>
          <div className="k">Next credential renewal</div>
        </div>
      </div>

      <h2 className="section-title">Needs your attention</h2>
      <div className="attn">
        {ob.percent < 100 ? (
          <Link href="/onboarding">
            <span>Onboarding: {ob.completed} of {ob.applicable} required items</span>
            <span className="trend">due {dueDate(profile.startDate, "WITHIN_14_DAYS") ?? "—"}</span>
          </Link>
        ) : null}
        {trainingDue.slice(0, 3).map((c) => (
          <Link key={c.key} href="/training">
            <span>Training due: {c.title}</span>
            <span className="trend">{dueDate(profile.startDate, c.deadlineBucket) ?? "no date"}</span>
          </Link>
        ))}
        {pendingAcks.slice(0, 3).map((p) => (
          <Link key={p.id} href="/policies">
            <span>Policy acknowledgement: {p.name}</span>
            <span className="trend">version {p.version}</span>
          </Link>
        ))}
        {compliances.filter((c) => c.remaining > 0).map((c) => (
          <Link key={c.credential.id} href="/credentials">
            <span>{c.rule.label}: {c.remaining} {c.rule.unit === "CPD_HOUR" ? "CPD hours" : `${c.rule.unit}s`} remaining</span>
            <span className="trend">cycle ends {c.credential.cycleEnd}</span>
          </Link>
        ))}
        {eco.score == null ? (
          <Link href="/scorecard">
            <span>Your monthly scorecard is ready</span>
            <span className="trend">self reflection outstanding</span>
          </Link>
        ) : null}
        {!ob.percent && !trainingDue.length && !pendingAcks.length ? <div><span className="sub">Nothing outstanding right now.</span></div> : null}
      </div>

      <h2 className="section-title">Working toward</h2>
      <div className="attn">
        {compliances.map((c) => (
          <div key={c.credential.id}>
            <span style={{ minWidth: 180 }}>{c.rule.label}</span>
            <span className={`meter ${c.remaining === 0 ? "good" : ""}`}>
              <div style={{ width: `${Math.min(100, Math.round((c.totalCompleted / c.totalRequired) * 100))}%` }} />
            </span>
            <span className="trend">{c.totalCompleted} of {c.totalRequired}</span>
          </div>
        ))}
        {openGoals.slice(0, 3).map((g) => (
          <Link key={g.id} href="/career">
            <span>Goal: {g.title}</span>
            <span className="trend">due {g.due}</span>
          </Link>
        ))}
      </div>
      {maximize.suggestions.length ? (
        <p className="sub" style={{ maxWidth: "72ch" }}>{maximize.suggestions[0]} <Link href="/pd" style={{ color: "var(--accent)" }}>Maximize my credits</Link></p>
      ) : null}

      <h2 className="section-title">From your team</h2>
      <div className="attn">
        {s.recognition.filter((r) => r.to === profile.name).slice(0, 4).map((r) => (
          <div key={r.id}>
            <span>+{r.points} {r.category}: {r.message}</span>
            <span className="trend">{r.date.slice(0, 10)}</span>
          </div>
        ))}
        {!s.recognition.some((r) => r.to === profile.name) ? (
          <div><span className="sub">No recognition yet this cycle. <Link href="/recognition" style={{ color: "var(--accent)" }}>Recognize a colleague</Link></span></div>
        ) : null}
      </div>

      {bonus.status !== "NOT_ENABLED" ? (
        <>
          <h2 className="section-title">Monthly bonus eligibility</h2>
          <div className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <b>Status</b>
              <span className={`pill ${bonus.status === "QUALIFIED" ? "good" : bonus.status === "PENDING" ? "neutral" : "warn"}`}>
                {bonus.status.replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
            <div className="attn" style={{ marginTop: 8 }}>
              {bonus.reasons.map((r) => (
                <div key={r.label}>
                  <span>{r.met ? "Met" : "Not met"}: {r.label}</span>
                  <span className="trend">{r.detail}</span>
                </div>
              ))}
            </div>
            <p className="sub">Eligibility only. Summit records no monetary amounts, and no model decides compensation.</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
