"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import { hr, hrAudit, saveHr } from "@/lib/hr-store";

/**
 * My Team. Membership and the team forum. Peer reviews live in My Scorecard,
 * where they belong to the same monthly act. Client information never belongs
 * in the forum.
 */
const FORUM_CATEGORIES = ["General", "Learning", "Resources", "Wins", "Questions", "Professional Development", "Site Updates", "Ideas"];

export default function TeamPage() {
  return (
    <HubGate>
      <TeamScreen />
    </HubGate>
  );
}

function TeamScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = React.useState<"team" | "forum">("team");
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading team…</p>;

  const s = hr();
  const profile = getProfile();

  return (
    <div>
      <h1 className="h-page">My Team</h1>
      <p className="sub">
        {profile.location ?? "Location not set"} · {profile.jobTitle ?? "Team member"}. Your team drives peer reviews, the forum and recognition.
      </p>

      <div className="mode-tabs" style={{ marginTop: 14 }} role="tablist" aria-label="Team views">
        {([["team", "Team"], ["forum", "Team forum"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`mode-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "team" ? <TeamTab /> : null}
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
            {!s.team.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Your peer group comes from your Summit team. Add colleagues to review them in My Scorecard.</td></tr> : null}
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
