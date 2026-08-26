"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import { getSetting } from "@summit/settings";
import { getCertificates, getProfile, getProgress, getTraining, onboardingProgress } from "@/lib/hub";
import { EggToast, TheClimb, useEasterEggs } from "@/components/grove";
import { computeCompliance } from "@/lib/credentials";
import { hr, hrAudit, saveHr, type Goal } from "@/lib/hr-store";

/**
 * Career Progress. A development pathway with the competencies, training and
 * credentials that sit behind each step, plus development goals written as
 * observable behaviour. A pathway describes development, never a promised
 * promotion.
 */
export default function CareerPage() {
  return (
    <HubGate>
      <CareerScreen />
    </HubGate>
  );
}

function CareerScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const eggs = useEasterEggs();
  const [f, setF] = React.useState({ title: "", behaviour: "", target: "", due: "", measurement: "", support: "" });
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading career progress…</p>;

  const s = hr();
  const profile = getProfile();
  const ladder = String(getSetting("career.ladder")).split(">").map((x) => x.trim()).filter(Boolean);
  const currentIdx = Math.max(0, ladder.findIndex((r) => r.toLowerCase() === (profile.jobTitle ?? "").toLowerCase()));
  const values = String(getSetting("eco.values")).split(",").map((v) => v.trim()).filter(Boolean);

  const ob = onboardingProgress(getProgress());
  const training = getTraining().filter((t) => t.status === "COMPLETED").length;
  const certs = getCertificates().length;
  const receivedAll = s.recognition.filter((r) => r.to === profile.name).reduce((n, r) => n + r.points, 0);
  const elevation = Math.min(100, Math.round(ob.percent * 0.4 + Math.min(training * 4, 30) + Math.min(receivedAll * 1.5, 30)));
  const compliances = s.credentials.map((c) => computeCompliance(c, s.allocations, s.activities)).filter((x): x is NonNullable<typeof x> => !!x);

  const addGoal = () => {
    const g: Goal = { id: `g-${Date.now().toString(36)}`, ...f, status: "OPEN" };
    s.goals.unshift(g);
    saveHr();
    hrAudit("goal.created", g.title);
    setF({ title: "", behaviour: "", target: "", due: "", measurement: "", support: "" });
    force();
  };
  const setStatus = (id: string, status: Goal["status"]) => {
    const g = s.goals.find((x) => x.id === id);
    if (!g) return;
    const prev = g.status;
    g.status = status;
    saveHr();
    hrAudit("goal.status", `${g.title}: ${prev} to ${status}`, { previous: prev, next: status });
    force();
  };

  return (
    <div>
      <h1 className="h-page">Career Progress</h1>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        A development pathway showing what each step asks for. Progressing along it depends on organizational need and
        supervisor assessment, so treat it as development rather than a guaranteed promotion.
      </p>

      <h2 className="section-title">My Career Summit</h2>
      <p className="sub" style={{ marginTop: -8 }}>Camps are the development pathway. Onboarding, modules and appreciation lift your elevation.</p>
      <div
        onPointerDown={() => { const t = setTimeout(() => eggs.unlock("grove", "No one rises alone. The ecosystem climbs together."), 900); const clear = () => { clearTimeout(t); window.removeEventListener("pointerup", clear); }; window.addEventListener("pointerup", clear); }}
        style={{ maxWidth: 560, cursor: "pointer" }} title="My Career Summit">
        <TheClimb elevation={elevation} camps={ladder} />
      </div>
      <p className="trend">Elevation {elevation} of 100 · current camp: <b>{ladder[currentIdx]}</b></p>
      <EggToast toast={eggs.toast} />

      <h2 className="section-title">Where you stand</h2>
      <div className="stat-row">
        <div className="stat"><div className="v">{ob.percent}%</div><div className="k">Onboarding complete</div></div>
        <div className="stat"><div className="v">{training}</div><div className="k">Training courses complete</div></div>
        <div className="stat"><div className="v">{certs}</div><div className="k">Certificates earned</div></div>
        <div className="stat"><div className="v">{compliances.filter((c) => c.remaining === 0).length} / {compliances.length}</div><div className="k">Credentials on pace</div></div>
      </div>

      <h2 className="section-title">Development goals</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="g-title">Goal</label>
            <input id="g-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Lead a parent coaching session" /></div>
          <div className="field"><label htmlFor="g-due">Due</label>
            <input id="g-due" type="date" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="g-behaviour">Observable behaviour</label>
          <input id="g-behaviour" className="input" value={f.behaviour} onChange={(e) => setF({ ...f, behaviour: e.target.value })}
            placeholder="What someone would see you doing" /></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="g-target">Target</label>
            <input id="g-target" className="input" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="e.g. two sessions with supervisor feedback" /></div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="g-measure">Measurement</label>
            <input id="g-measure" className="input" value={f.measurement} onChange={(e) => setF({ ...f, measurement: e.target.value })} placeholder="How it will be measured" /></div>
        </div>
        <div className="field"><label htmlFor="g-support">Support needed</label>
          <input id="g-support" className="input" value={f.support} onChange={(e) => setF({ ...f, support: e.target.value })} /></div>
        <div><button className="btn" onClick={addGoal} disabled={!f.title.trim() || !f.behaviour.trim()}>Add goal</button></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {s.goals.map((g) => (
          <div key={g.id} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{g.title}</b>
              <select className="input" style={{ width: "auto", padding: "4px 8px" }} value={g.status}
                onChange={(e) => setStatus(g.id, e.target.value as Goal["status"])} aria-label={`Status for ${g.title}`}>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="MET">Met</option>
                <option value="CARRIED_FORWARD">Carried forward</option>
              </select>
            </div>
            <p className="sub">{g.behaviour}</p>
            <p className="trend" style={{ marginTop: 6 }}>
              Target: {g.target || "not set"} · Measured by: {g.measurement || "not set"} · Due {g.due || "no date"}
              {g.support ? ` · Support: ${g.support}` : ""}
            </p>
          </div>
        ))}
        {!s.goals.length ? <div className="card card-pad"><p className="sub">No goals yet.</p></div> : null}
      </div>

      <h2 className="section-title">Organizational values</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {values.map((v) => <span key={v} className="pill neutral">{v}</span>)}
      </div>
      <p className="sub">Values are configured by your organization and connect recognition, scorecard behaviours and goals.</p>
    </div>
  );
}
