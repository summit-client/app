"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getProfile, getProgress, getTraining, onboardingProgress, refreshDue } from "@/lib/hub";
import { HUB_COURSES } from "@/lib/content";
import { BAND_LABEL, CLINIC_DOMAINS, clinicAverage, computeAutoResponses, computeEcosystem, percentileBand, rankSites } from "@/lib/ecosystem";
import { addScoreboardSite, currentCycle, hr, setSiteDomain } from "@/lib/hr-store";
import { BerryBurst, EggToast, ScoreRing, useEasterEggs, Volcano } from "@/components/grove";
import { PerformanceCheckin, PeerReviews } from "@/components/checkin";
import { saved } from "@summit/toast";

/**
 * Clinic scoreboard. Sites compete; people do not. Individual standing is a
 * private band shown only to the person it belongs to.
 *
 * Every control here saves by itself - there is no Save button - so saved()
 * from @summit/toast is what confirms a write landed and what reports one that
 * did not. Before migration 0079 there was nothing to confirm: both controls
 * called a saveLocal() that did nothing at all in live mode.
 */
export default function ScoreboardPage() {
  return (
    <HrGate>
      <ScoreboardScreen />
    </HrGate>
  );
}

/**
 * How long a slider sits still before its value is written.
 *
 * A range input fires onChange on every step, so dragging 0 -> 85 is eighty-five
 * events. Writing each one would be eighty-five round trips for one decision.
 * The value on screen still updates on every step (see `pending` below); only
 * the write waits.
 */
const COMMIT_MS = 400;

function ScoreboardScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [burst, setBurst] = React.useState(false);
  const [tab, setTab] = React.useState<"checkin" | "peers" | "clinic">("checkin");
  /**
   * Domain values typed but not yet written, keyed by domain key.
   *
   * Only ever applies to the viewer's own site, because that is the only site
   * with sliders. Keeping them here rather than writing them straight into the
   * snapshot is what makes a failed save recoverable: clearing the entry drops
   * the screen back to whatever the database actually holds, with no second
   * copy of "the last good value" to keep in sync.
   */
  const [pending, setPending] = React.useState<Record<string, number>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const eggs = useEasterEggs();
  React.useEffect(() => setReady(true), []);
  // Deliberately no cleanup that cancels the timers on unmount: a pending
  // value is a save the person already asked for, and navigating away half a
  // second later should not throw it out.
  if (!ready) return <p className="sub">Loading…</p>;

  const s = hr();
  const profile = getProfile();
  const sites = rankSites(s.sites.map((x) => {
    // The overlay applies to your own site only - see `pending`. Applying it
    // to the average too keeps the meter, the rank and the "N to go" moving
    // with the slider instead of jumping when the write lands.
    const domains = x.site === profile.location ? { ...x.domains, ...pending } : x.domains;
    const average = clinicAverage(domains);
    return { site: x.site, domains, average, unlocked: average >= 85 };
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
    setPending((p) => ({ ...p, [key]: value }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      void (async () => {
        const row = hr().sites.find((x) => x.site === site);
        const was = row ? clinicAverage(row.domains) >= 85 : false;
        // saved() resolves either way rather than throwing, so the overlay is
        // cleared on both paths: on success the snapshot now holds this value,
        // on failure it still holds the one the database has and the slider
        // snaps back to it - with the reason in a toast rather than a number
        // on a shared board that only this browser believes.
        await saved(() => setSiteDomain(site, key, value));
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
        // Unlocking is announced only once the score is really recorded.
        if (row && !was && clinicAverage(row.domains) >= 85) {
          setBurst(true);
          setTimeout(() => setBurst(false), 2800);
        }
        force();
      })();
    }, COMMIT_MS);
  };

  const addSite = async (input: HTMLInputElement) => {
    const name = input.value.trim();
    if (!name || s.sites.some((x) => x.site === name)) return;
    // Cleared only once it is really on the board. This used to clear
    // unconditionally, which was harmless while the write was a no-op and
    // would not be now: a rejected insert would take the typed name with it.
    if (await saved(() => addScoreboardSite(name))) input.value = "";
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
          onKeyDown={(e) => { if (e.key === "Enter") void addSite(e.target as HTMLInputElement); }} />
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
