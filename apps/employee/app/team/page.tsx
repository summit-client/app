"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { getProfile } from "@/lib/hub";
import { addForumComment, addForumPost, directory, hr } from "@/lib/hr-store";
import { useHrAction, WriteError } from "@/components/hr-provider";

/**
 * My Team. Membership and the team forum. Peer reviews live in My Scorecard,
 * where they belong to the same monthly act. Client information never belongs
 * in the forum.
 */
const FORUM_CATEGORIES = ["General", "Learning", "Resources", "Wins", "Questions", "Professional Development", "Site Updates", "Ideas"];

export default function TeamPage() {
  return (
    <HrGate>
      <TeamScreen />
    </HrGate>
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

  // The peer group is everyone in the clinic with an account. It used to be a
  // list you typed into, stored in this browser - so "your team" was whatever
  // you had personally typed, and nobody else ever saw it.
  const people = directory().filter((p) => p.id !== profile.id);

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
            {people.map((m) => (
              <tr key={m.id}><td><b>{m.name}</b></td><td>{m.jobTitle ?? "\u2014"}</td><td>{m.accessLevel.toLowerCase()}</td></tr>
            ))}
            {!people.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Nobody else in your clinic has a Summit account yet. An administrator creates accounts; your peer group appears here once they do.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        Your peer group is everyone in your clinic with a Summit account. It is not a list you keep yourself \u2014
        an administrator creates accounts, and people appear here automatically.
      </p>
    </>
  );
}

function ForumTab({ onChange }: { onChange: () => void }) {
  const { run, error: writeError, clearError } = useHrAction();
  const s = hr();
  const me = getProfile().name;
  const [f, setF] = React.useState({ category: FORUM_CATEGORIES[0], title: "", body: "" });
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");

  const post = () => void run(async () => {
    await addForumPost({ category: f.category, author: me, title: f.title, body: f.body });
    setF({ category: f.category, title: "", body: "" });
    onChange();
  });
  const comment = (id: string) => {
    if (!reply.trim()) return;
    void run(async () => {
      await addForumComment(id, reply.trim(), me);
      setReply(""); setReplyTo(null);
      onChange();
    });
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
