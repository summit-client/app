"use client";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import { CLINIC_DOMAINS, clinicAverage, computeEcosystem, percentileBand, rankSites } from "@/lib/ecosystem";
import { currentCycle, hr, saveHr } from "@/lib/hr-store";
import { BerryBurst, EggToast, ServiceberryTree, useEasterEggs, Volcano } from "@/components/grove";

/**
 * Clinic scoreboard. Sites compete; people do not. Individual standing is a
 * private band shown only to the person it belongs to.
 */
export default function ScoreboardPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [burst, setBurst] = React.useState(false);
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
  const eco = computeEcosystem(s.responses);
  const band = eco.score != null ? percentileBand(eco.score, s.peerScores) : null;

  const setDomain = (site: string, key: string, value: number) => {
    const row = s.sites.find((x) => x.site === site);
    if (!row) return;
    const was = clinicAverage(row.domains) >= 85;
    row.domains[key] = value;
    saveHr();
    if (!was && clinicAverage(row.domains) >= 85) {
      setBurst(true);
      setTimeout(() => setBurst(false), 2800);
    }
    force();
  };

  const addSite = (name: string) => {
    if (!name.trim() || s.sites.some((x) => x.site === name)) return;
    s.sites.push({ site: name.trim(), domains: Object.fromEntries(CLINIC_DOMAINS.map((d) => [d.key, 0])) });
    saveHr();
    force();
  };

  return (
    <div>
      <BerryBurst run={burst} />
      <EggToast toast={eggs.toast} />

      <div className="hero">
        <div className="hero-figure"><Volcano active={!!mine?.unlocked} /></div>
        <div className="hero-main">
          <h1 className="h-page" style={{ marginBottom: 2 }}>Clinic Scoreboard</h1>
          <p className="sub" style={{ marginTop: 0 }}>{currentCycle()} · sites reach 85 to unlock the group reward</p>
          {band ? <p className="trend" style={{ marginTop: 8 }}>You: <b>{band.band}</b>. {band.detail}</p> : null}
        </div>
      </div>

      <div className="board">
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
            <ServiceberryTree percent={mine.average} size={150} />
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
    </div>
  );
}
