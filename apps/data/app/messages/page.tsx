"use client";

import * as React from "react";
import {
  categoryLabel, getMessages, getThreads, overdue, postReply, replyProblem,
  sortQueue, statusLabel, updateThread, waitingFor,
  type Message, type Thread,
} from "@/lib/messaging";

/**
 * Family messages, from the clinic's side.
 *
 * The family half of this shipped first, which meant families could send
 * messages that nobody at the clinic could read or answer. This is the queue
 * that closes that.
 *
 * Ordered by what has been waiting longest rather than by what arrived last.
 * A queue sorted by recency buries Tuesday's unanswered question under this
 * morning's, which is the exact failure a queue exists to prevent.
 */
export default function MessagesPage() {
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState<Date | null>(null);

  // The clock is set after mount rather than during render: "3 days" computed
  // on the server and again in the browser is a hydration mismatch, and this
  // page is rendered on both.
  React.useEffect(() => { setNow(new Date()); }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setThreads(await getThreads()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load messages."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const openThread = React.useCallback(async (id: string) => {
    setOpenId(id); setReply(""); setInternal(false); setError(null);
    try { setMessages(await getMessages(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load that conversation."); }
  }, []);

  async function send() {
    if (!openId) return;
    const problem = replyProblem(reply);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      await postReply(openId, reply, internal ? "internal" : "shared");
      setReply("");
      setMessages(await getMessages(openId));
      setThreads(await getThreads());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your reply was not sent.");
    } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: Thread["status"]) {
    setBusy(true); setError(null);
    try { await updateThread(id, { status }); setThreads(await getThreads()); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not save."); }
    finally { setBusy(false); }
  }

  const queue = React.useMemo(() => sortQueue(threads), [threads]);
  const open = queue.find((t) => t.id === openId) ?? null;
  const waiting = now ? overdue(threads, now) : [];

  return (
    <div>
      <h1 className="h-page">Family messages</h1>

      {waiting.length > 0 ? (
        <p className="sub" style={{ maxWidth: "72ch" }}>
          {waiting.length} conversation{waiting.length === 1 ? " has" : "s have"} been
          waiting more than a day for a reply.
        </p>
      ) : (
        <p className="sub" style={{ maxWidth: "72ch" }}>
          Conversations families started, oldest unanswered first.
        </p>
      )}

      {error ? <p className="pill bad" style={{ marginTop: 10 }}>{error}</p> : null}
      {loading ? <p className="sub">Loading…</p> : null}

      {!loading && queue.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <p className="sub" style={{ margin: 0 }}>
            No family has started a conversation yet.
          </p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
        {queue.map((t) => {
          const isOpen = t.id === openId;
          return (
            <div key={t.id} className="card">
              <button
                type="button"
                onClick={() => (isOpen ? setOpenId(null) : void openThread(t.id))}
                aria-expanded={isOpen}
                className="card-pad"
                style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: 0, cursor: "pointer", display: "flex", gap: 12,
                  alignItems: "baseline", flexWrap: "wrap",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: "var(--text-sm)" }}>{t.subject}</b>
                  <span className="sub" style={{ display: "block", marginTop: 3 }}>
                    {t.clientName ?? t.householdName ?? "A family"}
                    {" · "}{categoryLabel(t.category)}
                    {t.priority === "high" ? " · urgent" : ""}
                  </span>
                </span>
                {/* Status as a word plus how long it has waited. A queue that
                    shows only status cannot be triaged: everything unanswered
                    looks equally urgent. */}
                <span className="sub" style={{ whiteSpace: "nowrap" }}>
                  {statusLabel(t.status)}
                  {now && t.status !== "resolved" ? ` · ${waitingFor(t, now)}` : ""}
                </span>
              </button>

              {isOpen ? (
                <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                  <ol style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 10 }}>
                    {messages.map((m) => {
                      const note = m.visibility === "internal";
                      return (
                        <li
                          key={m.id}
                          style={{
                            border: "1px solid var(--line)",
                            // An internal note is visually a different kind of
                            // object, not a tinted message: dashed, labelled,
                            // and never mistakable for something the family
                            // can see.
                            borderStyle: note ? "dashed" : "solid",
                            borderRadius: 10, padding: "12px 14px",
                            background: note ? "var(--amber-mist, #FDF8EE)" : "transparent",
                            maxWidth: "min(680px, 100%)",
                            marginLeft: m.authorKind === "staff" ? "auto" : 0,
                          }}
                        >
                          <p className="sub" style={{ margin: "0 0 6px" }}>
                            {note ? "Internal note — the family cannot see this" : null}
                            {!note && m.authorKind === "family" ? "From the family" : null}
                            {!note && m.authorKind === "staff" ? "Sent to the family" : null}
                            {" · "}{new Date(m.createdAt).toLocaleString()}
                          </p>
                          <p style={{ margin: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                            {m.body}
                          </p>
                        </li>
                      );
                    })}
                  </ol>

                  <div style={{ display: "grid", gap: 8, maxWidth: 680 }}>
                    <label className="sub" htmlFor={`reply-${t.id}`}>
                      {internal ? "Internal note" : "Reply to the family"}
                    </label>
                    <textarea
                      id={`reply-${t.id}`}
                      className="input"
                      rows={3}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                        style={{ width: 18, height: 18 }}
                      />
                      <span className="sub" style={{ margin: 0 }}>
                        Internal note — staff only, never shown to the family
                      </span>
                    </label>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn" onClick={send} disabled={busy || !reply.trim()}>
                        {busy ? "Sending…" : internal ? "Save note" : "Send reply"}
                      </button>
                      {t.status !== "resolved" ? (
                        <button className="btn ghost" onClick={() => void setStatus(t.id, "resolved")} disabled={busy}>
                          Mark resolved
                        </button>
                      ) : (
                        <button className="btn ghost" onClick={() => void setStatus(t.id, "open")} disabled={busy}>
                          Reopen
                        </button>
                      )}
                    </div>

                    {/* Said where the decision is made, not in a help page.
                        The distinction is the whole design of this feature and
                        it is one checkbox away from being got wrong. */}
                    <p className="trend" style={{ margin: 0 }}>
                      A reply appears in the family&apos;s portal. An internal note never
                      does, and does not move this conversation or notify anyone.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
