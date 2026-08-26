"use client";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import { PEER_PROMPTS, RATING_SCALE, requiresExample, DEFAULT_METRICS, type RatingValue } from "@/lib/ecosystem";
import { hr, hrAudit, saveHr } from "@/lib/hr-store";

/**
 * My Team. Team membership, peer feedback and the team forum.
 *
 * Confidentiality: peers submit behaviour-specific feedback; employees receive
 * themes, strengths and development opportunities; identified detail stays with
 * managers who hold the permission. Client information never belongs in team
 * messages or the forum.
 */
const FORUM_CATEGORIES = ["General", "Learning", "Resources", "Wins", "Questions", "Professional Development", "Site Updates", "Ideas"];

export default function TeamPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = React.useState<"team" | "feedback" | "forum">("team");
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading team…</p>;

  const s = hr();
  const profile = getProfile();

  return (
    <div>
      <h1 className="h-page">My Team</h1>
      <p className="sub">
        {profile.location ?? "Location not set"} · {profile.jobTitle ?? "Team member"}. Team membership drives peer
        review assignments, forum access and recognition.
      </p>

      <div className="mode-tabs" style={{ marginTop: 14 }} role="tablist" aria-label="Team views">
        {([["team", "Team"], ["feedback", "Peer feedback"], ["forum", "Team forum"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`mode-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "team" ? <TeamTab /> : null}
      {tab === "feedback" ? <FeedbackTab onChange={force} /> : null}
      {tab === "forum" ? <ForumTab onChange={force} /> : null}
    </div>
  );
}

function TeamTab() {
  const s = hr();
  const profile = getProfile();
  const [f, setF] = React.useState({ name: "", role: "", team: "Clinical Services" });
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  const add = () => {
    s.team.push({ ...f });
    saveHr();
    hrAudit("team.member_added", `${f.name} (${f.role})`);
    setF({ name: "", role: "", team: f.team });
    force();
  };

  return (
    <>
      <h2 className="section-title">My teams</h2>
      <div className="attn">
        <div><span>Primary location</span><span className="trend">{profile.location ?? "not set"}</span></div>
        <div><span>Supervisor</span><span className="trend">assigned in your Summit profile</span></div>
        <div><span>Peer group</span><span className="trend">{s.team.length} member{s.team.length === 1 ? "" : "s"}</span></div>
      </div>

      <h2 className="section-title">Peer group</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Team</th></tr></thead>
          <tbody>
            {s.team.map((m) => (
              <tr key={m.name}><td><b>{m.name}</b></td><td>{m.role}</td><td>{m.team}</td></tr>
            ))}
            {!s.team.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>In live mode your peer group comes from your Summit team membership. Add colleagues here to try peer feedback in preview.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="card card-pad" style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field"><label htmlFor="t-name">Name</label>
          <input id="t-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-role">Role</label>
          <input id="t-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-team">Team</label>
          <input id="t-team" className="input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></div>
        <button className="btn secondary" onClick={add} disabled={!f.name.trim()}>Add colleague</button>
      </div>
    </>
  );
}

function FeedbackTab({ onChange }: { onChange: () => void }) {
  const s = hr();
  const [peer, setPeer] = React.useState("");
  const [ratings, setRatings] = React.useState<Record<string, RatingValue>>({});
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const peerMetrics = DEFAULT_METRICS.filter((m) => m.source === "PEER");

  const submit = () => {
    for (const [metricKey, rating] of Object.entries(ratings)) {
      s.responses.push({ metricKey, source: "PEER", rating, comment: answers[metricKey] ?? "", rater: "anonymous" });
    }
    saveHr();
    hrAudit("peer_feedback.submitted", `Feedback submitted for ${peer || "a colleague"}`);
    setRatings({}); setAnswers({}); setPeer("");
    onChange();
  };

  const lowWithoutExample = Object.entries(ratings).some(([k, v]) => requiresExample(v) && !(answers[k] ?? "").trim());

  return (
    <>
      <h2 className="section-title">Give peer feedback</h2>
      <p className="sub" style={{ maxWidth: "70ch" }}>
        Think about the past month working with this person: collaboration, observations in session, team meetings, case
        discussion. Rate the behaviour, not the personality. A rating of 1 or 2 asks for an example and a suggestion.
      </p>

      <div className="card card-pad" style={{ marginTop: 12, display: "grid", gap: 14 }}>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="pf-peer">Colleague</label>
          <input id="pf-peer" className="input" list="peers" value={peer} onChange={(e) => setPeer(e.target.value)} />
          <datalist id="peers">{s.team.map((t) => <option key={t.name} value={t.name} />)}</datalist>
        </div>

        {peerMetrics.map((m) => (
          <div key={m.key}>
            <b style={{ fontSize: "var(--text-sm)" }}>{m.behaviour}</b>
            <div className="scale-row" style={{ marginTop: 8 }} role="group" aria-label={m.behaviour}>
              {RATING_SCALE.map((r) => (
                <button key={r.value} className={`scale-btn ${ratings[m.key] === r.value ? "on" : ""}`} title={r.anchor}
                  aria-pressed={ratings[m.key] === r.value}
                  onClick={() => setRatings({ ...ratings, [m.key]: r.value })}>{r.value}</button>
              ))}
            </div>
            {ratings[m.key] && requiresExample(ratings[m.key]) ? (
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor={`pf-${m.key}`}>What happened, what would improvement look like, and what support might help?</label>
                <textarea id={`pf-${m.key}`} className="input" rows={2} value={answers[m.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [m.key]: e.target.value })} />
              </div>
            ) : null}
          </div>
        ))}

        <div>
          <b style={{ fontSize: "var(--text-sm)" }}>Two stars and a wish</b>
          {PEER_PROMPTS.map((p) => (
            <div className="field" key={p} style={{ marginTop: 8 }}>
              <label htmlFor={`pp-${p}`}>{p}</label>
              <textarea id={`pp-${p}`} className="input" rows={2} value={answers[p] ?? ""} onChange={(e) => setAnswers({ ...answers, [p]: e.target.value })} />
            </div>
          ))}
        </div>

        {lowWithoutExample ? <p className="rule-note">A rating of 1 or 2 needs an example and a suggested support.</p> : null}
        <div>
          <button className="btn" onClick={submit} disabled={!Object.keys(ratings).length || lowWithoutExample}>Submit feedback</button>
        </div>
        <p className="sub">
          Your colleague receives themes, strengths and development opportunities. Your identity stays with the feedback
          administrators, and identified detail is available only to managers with permission.
        </p>
      </div>
    </>
  );
}

function ForumTab({ onChange }: { onChange: () => void }) {
  const s = hr();
  const me = getProfile().name;
  const [f, setF] = React.useState({ category: FORUM_CATEGORIES[0], title: "", body: "" });
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");

  const post = () => {
    s.posts.unshift({ id: `p-${Date.now().toString(36)}`, category: f.category, author: me, title: f.title, body: f.body, date: new Date().toISOString(), comments: [] });
    saveHr();
    hrAudit("forum.posted", f.title);
    setF({ category: f.category, title: "", body: "" });
    onChange();
  };
  const comment = (id: string) => {
    const p = s.posts.find((x) => x.id === id);
    if (!p || !reply.trim()) return;
    p.comments.push({ author: me, body: reply.trim(), date: new Date().toISOString() });
    saveHr();
    setReply(""); setReplyTo(null);
    onChange();
  };

  return (
    <>
      <h2 className="section-title">Team forum</h2>
      <div className="card card-pad hub-banner" style={{ marginBottom: 12 }}>
        <p className="sub" style={{ color: "var(--ink)", marginTop: 0 }}>
          Keep client information out of the forum and general team messages. Clinical detail belongs in the client record.
        </p>
      </div>

      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="fp-cat">Category</label>
            <select id="fp-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {FORUM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1, minWidth: 240 }}><label htmlFor="fp-title">Title</label>
            <input id="fp-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="fp-body">Post</label>
          <textarea id="fp-body" className="input" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div><button className="btn" onClick={post} disabled={!f.title.trim() || !f.body.trim()}>Post</button></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {s.posts.map((p) => (
          <div key={p.id} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{p.title}</b>
              <span className="trend">{p.category} · {p.author} · {p.date.slice(0, 10)}</span>
            </div>
            <p className="sub" style={{ maxWidth: "70ch" }}>{p.body}</p>
            {p.comments.map((c, i) => (
              <p key={i} className="trend" style={{ marginTop: 6, paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
                <b>{c.author}</b>: {c.body}
              </p>
            ))}
            {replyTo === p.id ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: 1, minWidth: 200 }} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
                <button className="btn" onClick={() => comment(p.id)}>Reply</button>
              </div>
            ) : (
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setReplyTo(p.id)}>Comment</button>
            )}
          </div>
        ))}
        {!s.posts.length ? <div className="card card-pad"><p className="sub">No posts yet.</p></div> : null}
      </div>
    </>
  );
}
