"use client";

import * as React from "react";
import {
  acknowledge, confirmMaterial, getMaterials, getNotes, isComplete, kindLabel,
  outstanding, sign, type Material, type SupervisionNote,
} from "@/lib/supervision";
import { useIdentity } from "@/components/session-provider";

/**
 * Supervision.
 *
 * One screen for both sides of it: notes written about you, and notes you
 * wrote. A supervisor is also somebody's supervisee, and splitting this into
 * two screens would mean two places to look for the same kind of record.
 *
 * Open notes lead. A note is not finished when it is written - it is finished
 * when the supervisor has signed it, the supervisee has confirmed they read
 * it, and the assigned materials are confirmed. All three are shown, because a
 * single "status" would have to pick one of them to report.
 */
export default function SupervisionPage() {
  const identity = useIdentity();
  const [notes, setNotes] = React.useState<SupervisionNote[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [signName, setSignName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setNotes(await getNotes()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load supervision."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function open(n: SupervisionNote) {
    if (openId === n.id) { setOpenId(null); return; }
    setOpenId(n.id); setMaterials([]); setSignName(""); setError(null);
    try { setMaterials(await getMaterials(n.id)); } catch { /* none is a real state */ }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); if (openId) setMaterials(await getMaterials(openId)); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not save."); }
    finally { setBusy(false); }
  }

  const me = identity.userId;
  const openCount = notes.filter((n) => !isComplete(n)).length;

  return (
    <div>
      <h1 className="h-page">Supervision</h1>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        {openCount > 0
          ? `${openCount} supervision note${openCount === 1 ? "" : "s"} still need something.`
          : "Supervision notes about you, and notes you have written."}
      </p>

      {/* There is a second thing called Supervision in this app: the
          AI-assisted case review on a client's own Supervision tab, which reads
          their data and proposes review categories. It is not this. That one
          analyses a client; this one is the record of a conversation between two
          people. Saying so here beats letting them look like duplicates. */}
      <p className="sub" style={{ maxWidth: "72ch" }}>
        Looking for a case review of one client&apos;s data? That lives on that
        client&apos;s own Supervision tab.
      </p>

      {error ? <p className="pill bad" style={{ marginTop: 10 }}>{error}</p> : null}
      {loading ? <p className="sub">Loading…</p> : null}

      {!loading && notes.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <p className="sub" style={{ margin: 0 }}>No supervision notes yet.</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {notes.map((n) => {
          const isOpen = openId === n.id;
          const todo = outstanding(n);
          const iAmSupervisee = me === n.superviseeId;
          const iAmSupervisor = me === n.supervisorId;
          return (
            <div key={n.id} className="card">
              <button
                type="button" onClick={() => void open(n)} aria-expanded={isOpen}
                className="card-pad"
                style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: 0, cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b style={{ fontSize: "var(--text-sm)" }}>{kindLabel(n.kind)}</b>
                  <span className="sub" style={{ flex: 1, minWidth: 0 }}>
                    {n.occurredOn}{n.setting ? ` · ${n.setting}` : ""}
                    {iAmSupervisee ? " · about you" : iAmSupervisor ? " · written by you" : ""}
                  </span>
                  {todo.length === 0 ? (
                    <span className="pill ok">Complete</span>
                  ) : (
                    <span className="pill warn">{todo.length} outstanding</span>
                  )}
                </span>
              </button>

              {isOpen ? (
                <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                  {/* Each outstanding item named, rather than one status. The
                      three are independent: a note can be signed and
                      unacknowledged, or the reverse. */}
                  {todo.length > 0 ? (
                    <ul className="sub" style={{ margin: "0 0 14px", paddingLeft: 18 }}>
                      {todo.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  ) : null}

                  <Section title="Observations" body={n.observations} />
                  <Section title="Action items" body={n.actionItems} />
                  <Section title="Next steps" body={n.nextSteps} />

                  {materials.length > 0 ? (
                    <>
                      <p className="sub" style={{ margin: "14px 0 6px", fontWeight: 600 }}>
                        Assigned
                      </p>
                      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                        {materials.map((m) => (
                          <li key={m.id} style={{
                            display: "flex", gap: 10, alignItems: "baseline",
                            flexWrap: "wrap", border: "1px solid var(--line)",
                            borderRadius: 8, padding: "10px 12px",
                          }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              {m.url ? (
                                <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>
                              ) : m.title}
                              <span className="sub" style={{ display: "block", marginTop: 2 }}>
                                {m.kind.replace("_", " ")}
                                {m.dueOn ? ` · due ${m.dueOn}` : ""}
                              </span>
                            </span>
                            {m.confirmedAt ? (
                              <span className="pill ok" style={{ whiteSpace: "nowrap" }}>
                                Confirmed {new Date(m.confirmedAt).toLocaleDateString()}
                              </span>
                            ) : iAmSupervisee ? (
                              <button className="btn ghost" disabled={busy}
                                onClick={() => void run(() => confirmMaterial(m.id))}>
                                Confirm read
                              </button>
                            ) : (
                              <span className="pill warn" style={{ whiteSpace: "nowrap" }}>
                                Not yet confirmed
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                    {iAmSupervisee && !n.acknowledgedAt ? (
                      <button className="btn" disabled={busy}
                        onClick={() => void run(() => acknowledge(n.id))}>
                        Confirm I have read this
                      </button>
                    ) : null}

                    {n.acknowledgedAt ? (
                      <span className="sub">
                        {/* Said precisely. This is a read receipt, and a
                            record that lets it read as agreement turns it into
                            consent to a performance judgement. */}
                        Read by the supervisee on{" "}
                        {new Date(n.acknowledgedAt).toLocaleDateString()} &mdash; confirming
                        they have seen it, not that they agree with it.
                      </span>
                    ) : null}
                  </div>

                  {iAmSupervisor && !n.signedAt ? (
                    <div style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 14 }}>
                      <label className="sub" htmlFor={`sign-${n.id}`}>
                        Type your name to sign. Signing closes the note to edits.
                      </label>
                      <input
                        id={`sign-${n.id}`} className="input" value={signName}
                        onChange={(e) => setSignName(e.target.value)} autoComplete="name"
                      />
                      <div>
                        <button className="btn" disabled={busy || !signName.trim()}
                          onClick={() => void run(() => sign(n.id, signName))}>
                          Sign this note
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {n.signedAt ? (
                    <p className="sub" style={{ marginTop: 12 }}>
                      Signed by {n.signedName} on {new Date(n.signedAt).toLocaleDateString()}.
                      Signed notes cannot be edited &mdash; write a new one instead.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p className="sub" style={{ margin: "0 0 4px", fontWeight: 600 }}>{title}</p>
      <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
        {body}
      </p>
    </div>
  );
}
