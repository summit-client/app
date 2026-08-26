"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getProfile, getProgress, getTraining, onboardingProgress, refreshDue } from "@/lib/hub";
import { HUB_COURSES } from "@/lib/content";
import { BAND_LABEL, CLINIC_DOMAINS, clinicAverage, computeAutoResponses, computeEcosystem, percentileBand, rankSites } from "@/lib/ecosystem";
import { currentCycle, hr, saveLocal } from "@/lib/hr-store";
import { BerryBurst, EggToast, ScoreRing, useEasterEggs, Volcano } from "@/components/grove";
import { PerformanceCheckin, PeerReviews } from "@/components/checkin";

/**
 * Clinic scoreboard. Sites compete; people do not. Individual standing is a
 * private band shown only to the person it belongs to.
 */
export default function ScoreboardPage() {
  return (
    <HrGate>
      <ScoreboardScreen />
    </HrGate>
  );
}

function ScoreboardScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [burst, setBurst] = React.useState(false);
  const [tab, setTab] = React.useState<"checkin" | "peers" | "clinic">("checkin");
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const s = hr();
  const profile = getProfile();
  const sites = rankSites(s.sites.map((x) => {
    const average = clinicAverage(x.domains);
    return { site: x.site, domains: x.domains, average, unlocked: average >= 85 };
  }));
  const mine = sites.find((x) => x.site === profile.location) ?? null;
  const ob = onboardingProgress(getProgress());
  const dated = HUB_COURSES.filter((c) => c.deadlineBucket !== "CUSTOM");
  const doneCourses = new Set(getTraining().filter((t) => t.status === "COMPLETED" && !refreshDue(t).due).map((t) => t.courseKey));
  const trainingPct = dated.length ? Math.round((dated.filter((c) => doneCourses.has(c.key)).length / dated.length) * 100) : null;
  const recogPoints = s.recognition.filter((r) => r.to === profile.name && r.date.slice(0, 7) === currentCycle()).reduce((n, r) => n + r.points, 0);
  const eco = computeEcosystem([...s.responses, ...computeAutoResponses({ trainingPct, onboardingPct: ob.percent, recogPoints })]);
  const band = eco.score != null ? percentileBand(eco.score, s.peerScores) : null;

  const setDomain = (site: string, key: string, value: number) => {
    const row = s.sites.find((x) => x.site === site);
    if (!row) return;
    const was = clinicAverage(row.domains) >= 85;
    row.domains[key] = value;
    saveLocal();
    if (!was && clinicAverage(row.domains) >= 85) {
      setBurst(true);
      setTimeout(() => setBurst(false), 2800);
    }
    force();
  };

  const addSite = (name: string) => {
    if (!name.trim() || s.sites.some((x) => x.site === name)) return;
    s.sites.push({ site: name.trim(), domains: Object.fromEntries(CLINIC_DOMAINS.map((d) => [d.key, 0])) });
    saveLocal();
    force();
  };

  return (
    <div>
      <BerryBurst run={burst} />
      <EggToast toast={eggs.toast} />

      <div className="hero">
        <div className="hero-figure"><Volcano active={!!mine?.unlocked} /></div>
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}>Scoreboard</h1>
          <p className="sub" style={{ marginTop: 0 }}>{currentCycle()} · sites reach 85 to unlock the group reward</p>
          {eco.band ? <p className={`hero-band ${eco.band === "BONUS" ? "bonus" : eco.band === "FEEDBACK_PLAN" ? "plan" : "coach"}`} style={{ marginTop: 8 }}>{BAND_LABEL[eco.band]}</p> : null}
          {band ? <p className="trend" style={{ marginTop: 8 }}>You: <b>{band.band}</b>. {band.detail}</p> : null}
        </div>
        <div className="hero-figure"><ScoreRing value={eco.score} label="Ecosystem score" /></div>
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Scoreboard sections">
        {([["checkin", "Performance Checkin"], ["peers", `Peer Reviews (${s.team.length})`], ["clinic", "Clinic Scoreboard"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`mode-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "checkin" ? <PerformanceCheckin onChange={force} /> : null}
      {tab === "peers" ? <PeerReviews onChange={force} /> : null}
      {tab !== "clinic" ? null : (<>
      <div className="board" style={{ marginTop: 16 }}>
        {sites.map((site, i) => (
          <div key={site.site} className={`board-row ${i === 0 && site.average > 0 ? "lead" : ""} ${site.site === profile.location ? "mine" : ""}`}>
            <span className="board-rank">{i === 0 && site.average > 0 ? "★" : i + 1}</span>
            <span className="board-name">{site.site}{site.site === profile.location ? " · you" : ""}</span>
            <span className="meter" style={{ maxWidth: 220 }}><div style={{ width: `${site.average}%`, background: site.unlocked ? "var(--good)" : "var(--accent)" }} /></span>
            <span className="board-score">{site.average}</span>
            {site.unlocked ? <span className="pill good">unlocked</span> : <span className="trend">{85 - site.average} to go</span>}
          </div>
        ))}
        {!sites.length ? (
          <div className="card card-pad">
            <b>No sites yet</b>
            <p className="sub">Add your organization&rsquo;s sites to start the board.</p>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 220 }} placeholder="Add a site" aria-label="Add a site"
          onKeyDown={(e) => { if (e.key === "Enter") { addSite((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }} />
        <span className="sub" style={{ marginTop: 8 }}>Press enter to add.</span>
      </div>

      {mine ? (
        <>
          <h2 className="section-title">{mine.site} branches</h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              {CLINIC_DOMAINS.map((d) => (
                <div key={d.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 170, fontSize: "var(--text-sm)" }}>{d.label}<div className="trend">{d.lead}</div></span>
                  <input type="range" min={0} max={100} value={mine.domains[d.key] ?? 0} aria-label={d.label}
                    onChange={(e) => setDomain(mine.site, d.key, Number(e.target.value))} style={{ flex: 1, minWidth: 120 }} />
                  <span className="board-score">{mine.domains[d.key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <h2 className="section-title">Hidden finds</h2>
      <div className="finds">
        {eggs.list.map((f) => (
          <span key={f.id} className={`find ${eggs.found.includes(f.id) ? "on" : ""}`} title={eggs.found.includes(f.id) ? f.label : f.hint} />
        ))}
        <span className="trend">{eggs.found.length} of {eggs.total}</span>
      </div>
      </>)}
    </div>
  );
}
