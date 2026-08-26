"use client";

import * as React from "react";
import Link from "next/link";
import { HUB_COURSES } from "@/lib/content";
import { dueDate, getProfile, getProgress, getTraining, onboardingProgress, refreshDue } from "@/lib/hub";
import { computeCompliance } from "@/lib/credentials";
import {
  BAND_LABEL, clinicAverage, computeAutoResponses, computeBonus, computeEcosystem,
  peerReviewDue, percentileBand, rankSites,
} from "@/lib/ecosystem";
import { currentCycle, hr } from "@/lib/hr-store";
import { BerryBurst, EggToast, ScoreRing, SummitPeaks, Volcano, useEasterEggs } from "@/components/grove";
import { Flourish, Reveal } from "@summit/design/motion";

/** Dashboard: widgets. Where you stand, what is due, and the ecosystem. */
export default function DashboardPage() {
  const [ready, setReady] = React.useState(false);
  const [taps, setTaps] = React.useState(0);
  const [burst, setBurst] = React.useState(false);
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const profile = getProfile();
  const s = hr();
  const ob = onboardingProgress(getProgress());
  const training = getTraining();
  const done = new Set(training.filter((t) => t.status === "COMPLETED" && !refreshDue(t).due).map((t) => t.courseKey));
  const datedCourses = HUB_COURSES.filter((c) => c.deadlineBucket !== "CUSTOM");
  const trainingDue = datedCourses.filter((c) => !done.has(c.key));
  const refreshes = training.filter((t) => refreshDue(t).due).length;
  const trainingPct = datedCourses.length ? Math.round(((datedCourses.length - trainingDue.length) / datedCourses.length) * 100) : null;
  const recog = s.recognition.filter((r) => r.to === profile.name && r.date.slice(0, 7) === currentCycle()).reduce((n, r) => n + r.points, 0);

  // Auto-sourced metrics merge with entered ones; scheduler and clinician
  // portal metrics stay pending until live data connects.
  const auto = computeAutoResponses({ trainingPct, onboardingPct: ob.percent, recogPoints: recog });
  const eco = computeEcosystem([...s.responses, ...auto]);

  const compliances = s.credentials.map((c) => computeCompliance(c, s.allocations, s.activities)).filter((x): x is NonNullable<typeof x> => !!x);
  const pendingAcks = s.policies.filter((p) => p.required && !s.acks.some((a) => a.policyId === p.id && a.version === p.version && a.acknowledgedAt));
  const sites = rankSites(s.sites.map((x) => ({ ...x, average: clinicAverage(x.domains), unlocked: clinicAverage(x.domains) >= 85 })));
  const mySite = sites.find((x) => x.site === profile.location) ?? sites[0] ?? null;
  const band = eco.score != null ? percentileBand(eco.score, s.peerScores) : null;

  const review = peerReviewDue();
  const peersReviewed = new Set(s.responses.filter((r) => r.source === "PEER" && r.subject).map((r) => r.subject)).size;
  const peersTotal = s.team.filter((t) => t.name !== profile.name).length;
  const reviewsOutstanding = Math.max(0, peersTotal - peersReviewed);

  const bonus = computeBonus({
    score: eco.score,
    trainingComplete: trainingDue.length === 0 && refreshes === 0,
    documentationComplete: true,
    credentialCompliant: compliances.every((c) => c.remaining === 0 || new Date(c.credential.cycleEnd) > new Date(Date.now() + 90 * 86_400_000)),
    policiesAcknowledged: pendingAcks.length === 0,
  });

  const tapVolcano = () => {
    const n = taps + 1;
    setTaps(n);
    if (n === 7) {
      setTaps(0);
      setBurst(true);
      setTimeout(() => setBurst(false), 2800);
      eggs.unlock("logo", "The mountain remembers. Berries for everyone.");
    }
  };

  return (
    <div>
      <BerryBurst run={burst} />
      <EggToast toast={eggs.toast} />

      <div className="hero" style={{ paddingBottom: 8 }}>
        <div className="hero-figure" onClick={tapVolcano} style={{ cursor: "pointer" }} title="Mount Etna">
          <Volcano active={!!mySite?.unlocked || burst} size={120} />
        </div>
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}><Flourish>Hi {profile.name.split(" ")[0]}</Flourish></h1>
          <p className="sub" style={{ marginTop: 0 }}>{currentCycle()} · {profile.location ?? "No site set"}</p>
          {eco.band ? <p className={`hero-band ${eco.band === "BONUS" ? "bonus" : eco.band === "FEEDBACK_PLAN" ? "plan" : "coach"}`} style={{ marginTop: 6 }}>{BAND_LABEL[eco.band]}</p> : null}
        </div>
      </div>

      {peersTotal > 0 && reviewsOutstanding > 0 ? (
        <div className="card card-pad hub-banner" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: "var(--text-sm)" }}>
              {reviewsOutstanding} peer review{reviewsOutstanding === 1 ? "" : "s"} due by the 5th
              {review.overdue ? ", now overdue" : review.daysLeft ? ` (${review.daysLeft} day${review.daysLeft === 1 ? "" : "s"} left)` : " (today)"}
            </b>
            <Link href="/scoreboard" className="btn" style={{ textDecoration: "none" }}>Review peers</Link>
          </div>
        </div>
      ) : null}

      <div className="widgets">
        <Link href="/scoreboard" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">Ecosystem Score</span>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <ScoreRing value={eco.score} size={84} />
            <div>
              <div className="split-bar" style={{ width: 130, height: 18 }}>
                <span className="me" style={{ width: `${eco.personal.percent / 2}%` }} />
                <span className="team" style={{ width: `${eco.group.percent / 2}%` }} />
              </div>
              <span className="trend">me {eco.personal.percent} · team {eco.group.percent}</span>
              {band ? <div className="trend">{band.band} (private)</div> : null}
            </div>
          </div>
        </Link>

        <Link href="/scoreboard" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">{mySite ? mySite.site : "The Ecosystem"}</span>
          <div className="widget-v">{mySite ? mySite.average : "—"}</div>
          <SummitPeaks percent={mySite?.average ?? 0} height={54} />
          <span className="trend">{mySite?.unlocked ? "Group reward unlocked" : mySite ? `${85 - mySite.average} to the group reward` : "No site data yet"}</span>
        </Link>

        <Link href="/recognition" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">Recognition</span>
          <div className="widget-v" style={{ color: "var(--good)" }}>+{recog}</div>
          <span className="trend">sparks this month</span>
        </Link>

        <Link href="/training" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">Training</span>
          <div className="widget-v">{trainingDue.length}</div>
          <span className="trend">due{refreshes ? ` · ${refreshes} yearly refresh${refreshes === 1 ? "" : "es"}` : ""}</span>
        </Link>

        <Link href="/credentials" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">Credits to earn</span>
          <div className="widget-v">{compliances.reduce((n, c) => n + c.remaining, 0)}</div>
          <span className="trend">across {compliances.length} credentials</span>
        </Link>

        <Link href="/policies" className="widget" style={{ textDecoration: "none" }}>
          <span className="widget-k">Policies</span>
          <div className="widget-v">{pendingAcks.length}</div>
          <span className="trend">to acknowledge</span>
        </Link>

        <div className="widget">
          <span className="widget-k">Reinforcer</span>
          <div style={{ marginTop: 4 }}>
            <span className={`pill ${bonus.status === "QUALIFIED" ? "good" : bonus.status === "PENDING" ? "neutral" : "warn"}`}>
              {bonus.status.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          <span className="trend">{bonus.reasons.filter((r) => r.met).length} of {bonus.reasons.length} conditions met</span>
        </div>

        <div className="widget">
          <span className="widget-k">Hidden finds</span>
          <div className="widget-v">{eggs.found.length}/{eggs.total}</div>
          <div className="finds">
            {eggs.list.map((f) => (
              <span key={f.id} className={`find ${eggs.found.includes(f.id) ? "on" : ""}`} title={eggs.found.includes(f.id) ? f.label : f.hint} />
            ))}
          </div>
        </div>
      </div>

      {ob.percent < 100 || trainingDue.length ? (
        <Reveal>
          <h2 className="section-title">Do next</h2>
          <div className="attn">
            {ob.percent < 100 ? (
              <Link href="/onboarding"><span>Onboarding {ob.completed} of {ob.applicable}</span><span className="trend">due {dueDate(profile.startDate, "WITHIN_14_DAYS") ?? ""}</span></Link>
            ) : null}
            {trainingDue.slice(0, 3).map((c) => (
              <Link key={c.key} href="/training"><span>{c.title}</span><span className="trend">{dueDate(profile.startDate, c.deadlineBucket) ?? ""}</span></Link>
            ))}
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}
