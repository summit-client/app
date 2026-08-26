"use client";

import * as React from "react";
import Link from "next/link";
import { HUB_COURSES } from "@/lib/content";
import { dueDate, getProfile, getProgress, getTraining, onboardingProgress } from "@/lib/hub";
import { computeCompliance } from "@/lib/credentials";
import { BAND_LABEL, clinicAverage, computeBonus, computeEcosystem, percentileBand, rankSites } from "@/lib/ecosystem";
import { currentCycle, hr } from "@/lib/hr-store";
import { BerryBurst, EggToast, ScoreRing, ServiceberryTree, SummitPeaks, Volcano, useEasterEggs } from "@/components/grove";

/** Dashboard. Where you stand, what the grove needs, and what is next. */
export default function DashboardPage() {
  const [ready, setReady] = React.useState(false);
  const [taps, setTaps] = React.useState(0);
  const [burst, setBurst] = React.useState(false);
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const profile = getProfile();
  const s = hr();
  const eco = computeEcosystem(s.responses);
  const ob = onboardingProgress(getProgress());
  const done = new Set(getTraining().filter((t) => t.status === "COMPLETED").map((t) => t.courseKey));
  const trainingDue = HUB_COURSES.filter((c) => (c.kind === "COMPLIANCE" || c.kind === "CLINICAL") && !done.has(c.key) && c.deadlineBucket !== "CUSTOM");
  const compliances = s.credentials.map((c) => computeCompliance(c, s.allocations, s.activities)).filter((x): x is NonNullable<typeof x> => !!x);
  const recog = s.recognition.filter((r) => r.to === profile.name && r.date.slice(0, 7) === currentCycle()).reduce((n, r) => n + r.points, 0);
  const pendingAcks = s.policies.filter((p) => p.required && !s.acks.some((a) => a.policyId === p.id && a.version === p.version && a.acknowledgedAt));

  const sites = rankSites(s.sites.map((x) => ({ ...x, average: clinicAverage(x.domains), unlocked: clinicAverage(x.domains) >= 85 })));
  const mySite = sites.find((x) => x.site === profile.location) ?? sites[0] ?? null;
  const band = eco.score != null ? percentileBand(eco.score, s.peerScores) : null;

  const bonus = computeBonus({
    score: eco.score,
    trainingComplete: trainingDue.length === 0,
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

  const attention = [
    ...(ob.percent < 100 ? [{ href: "/onboarding", label: `Onboarding ${ob.completed} of ${ob.applicable}`, meta: dueDate(profile.startDate, "WITHIN_14_DAYS") ?? "" }] : []),
    ...trainingDue.slice(0, 2).map((c) => ({ href: "/training", label: c.title, meta: dueDate(profile.startDate, c.deadlineBucket) ?? "" })),
    ...pendingAcks.slice(0, 2).map((p) => ({ href: "/policies", label: p.name, meta: `v${p.version}` })),
    ...compliances.filter((c) => c.remaining > 0).slice(0, 2).map((c) => ({ href: "/credentials", label: c.rule.label, meta: `${c.remaining} left` })),
    ...(eco.score == null ? [{ href: "/scorecard", label: "Your scorecard is open", meta: "rate + review peers" }] : []),
  ];

  return (
    <div>
      <BerryBurst run={burst} />
      <EggToast toast={eggs.toast} />

      <div className="hero">
        <div className="hero-figure" onClick={tapVolcano} style={{ cursor: "pointer" }} title="Mount Etna">
          <Volcano active={!!mySite?.unlocked || burst} />
        </div>
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}>Hi {profile.name.split(" ")[0]}</h1>
          <p className="sub" style={{ marginTop: 0 }}>{currentCycle()} · {profile.location ?? "No site set"}</p>
          {eco.band ? <p className={`hero-band ${eco.band === "BONUS" ? "bonus" : eco.band === "FEEDBACK_PLAN" ? "plan" : "coach"}`} style={{ marginTop: 8 }}>
            {BAND_LABEL[eco.band]}
          </p> : null}
          <div className="split">
            <span className="trend" style={{ minWidth: 46 }}>Me + team</span>
            <span className="split-bar" role="img" aria-label={`Personal ${eco.personal.percent}, group ${eco.group.percent}`}>
              <span className="me" style={{ width: `${eco.personal.percent / 2}%` }}>{eco.personal.percent ? eco.personal.percent : ""}</span>
              <span className="team" style={{ width: `${eco.group.percent / 2}%` }}>{eco.group.percent ? eco.group.percent : ""}</span>
            </span>
          </div>
          {band ? <p className="trend" style={{ marginTop: 8 }}>{band.band} · {band.detail}</p> : null}
        </div>
        <div className="hero-figure">
          <ScoreRing value={eco.score} label="Ecosystem score" />
        </div>
      </div>

      <div className="stat-row" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="stat"><div className="v" style={{ color: "var(--good)" }}>+{recog}</div><div className="k">Recognition</div></div>
        <div className="stat"><div className="v">{trainingDue.length}</div><div className="k">Training due</div></div>
        <div className="stat"><div className="v">{compliances.reduce((n, c) => n + c.remaining, 0)}</div><div className="k">Credits to earn</div></div>
        <div className="stat"><div className="v">{eggs.found.length}/{eggs.total}</div><div className="k">Hidden finds</div></div>
      </div>

      {attention.length ? (
        <>
          <h2 className="section-title">Do next</h2>
          <div className="attn">
            {attention.map((a) => (
              <Link key={a.label} href={a.href}><span>{a.label}</span><span className="trend">{a.meta}</span></Link>
            ))}
          </div>
        </>
      ) : null}

      <h2 className="section-title">The grove</h2>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div
          onPointerDown={() => { const t = setTimeout(() => eggs.unlock("grove", "No one tree stands tall alone. It rises with its grove."), 900); const clear = () => { clearTimeout(t); window.removeEventListener("pointerup", clear); }; window.addEventListener("pointerup", clear); }}
          style={{ cursor: "pointer" }} title="Serviceberry">
          <ServiceberryTree percent={mySite?.average ?? 0} golden={false} />
        </div>
        <div style={{ flex: 1, minWidth: 230 }}>
          <b style={{ fontSize: "var(--text-lg)" }}>{mySite ? `${mySite.site} · ${mySite.average}` : "No site data yet"}</b>
          <p className="sub" style={{ marginTop: 4 }}>
            {mySite?.unlocked ? "Group reward unlocked this cycle." : mySite ? `${85 - mySite.average} to unlock the group reward.` : "Site scores appear once a cycle is scored."}
          </p>
          <SummitPeaks percent={mySite?.average ?? 0} />
          <Link href="/scoreboard" className="btn" style={{ textDecoration: "none", marginTop: 10, display: "inline-block" }}>Clinic scoreboard</Link>
        </div>
      </div>

      <h2 className="section-title">Reinforcer</h2>
      <div className="attn">
        {bonus.reasons.map((r) => (
          <div key={r.label}>
            <span>{r.met ? "✓" : "○"} {r.label}</span>
            <span className="trend">{r.detail}</span>
          </div>
        ))}
        {bonus.status === "NOT_ENABLED" ? <div><span className="sub">Reinforcers are off for this organization.</span></div> : null}
      </div>
    </div>
  );
}
