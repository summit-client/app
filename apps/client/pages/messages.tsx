import type {
  GetServerSideProps, InferGetServerSidePropsType, NextApiRequest, NextApiResponse,
} from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { FamilyAvatar } from "../components/family-switcher";
import { LoadErrorNotice } from "../components/load-error-notice";
import { createClient } from "../lib/supabase-server";
import { canForAny, displayName, familyFromRows, type Family } from "../lib/family";
import {
  CATEGORY_OPTIONS, categoryLabel, previewOf, regardingLabel, sortThreads,
  messageProblem, statusLabel, subjectProblem, threadsFromRows, whenLabel,
  type Message, type Thread,
} from "../lib/messages";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type PageProps =
  | {
      mode: "inbox";
      family: Family;
      threads: Thread[];
      /** The thread being read, if the URL names one. */
      open: { thread: Thread; messages: Message[] } | null;
      composing: boolean;
      /** Server time, so relative times match between render and hydration. */
      now: string;
      loadError: boolean;
    }
  | { mode: "no-access" }
  | { mode: "error" };

/**
 * Secure messaging with the clinic.
 *
 * The thread being read lives in the URL rather than in component state, so a
 * conversation is linkable, survives a refresh, and works with the browser's
 * own back button. It also means this page renders correctly before any
 * JavaScript arrives, which matters more here than elsewhere: a parent chasing
 * a reply about tomorrow's session is often on a bad connection.
 *
 * Nothing on this page decides what a family may read. Internal staff notes are
 * excluded by migration 0038's row-level policy, not by a filter here — see the
 * note at the top of that migration for why that distinction is the whole
 * design.
 */
export default function Messages(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]!.value);
  const [about, setAbout] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Marking a thread read is a side effect of looking at it, so it belongs in
  // an effect rather than on a button: a parent who has read a reply should not
  // also have to tell us so. Fire-and-forget, and deliberately never surfaced
  // as an error — a stale badge is a smaller problem than an alert over a
  // conversation someone is in the middle of reading.
  //
  // The ref keeps it to once per thread per mount. Without it, the router
  // refresh after sending a reply re-runs this and posts again.
  const markedRef = useRef<string | null>(null);
  const openThreadId = props.mode === "inbox" && props.open ? props.open.thread.threadId : null;
  const hasUnread = props.mode === "inbox" && props.open ? props.open.thread.unreadCount > 0 : false;

  useEffect(() => {
    if (!openThreadId || !hasUnread) return;
    if (markedRef.current === openThreadId) return;
    markedRef.current = openThreadId;
    void fetch("/api/messages/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: openThreadId }),
    }).catch(() => { /* a badge, not a boundary */ });
  }, [openThreadId, hasUnread]);

  if (props.mode === "error") return <LoadErrorNotice />;

  if (props.mode === "no-access") {
    return (
      <>
        <MobileNavChrome title="Messages" />
        <div className={styles.page}>
          <Sidebar />
          <main className={styles.main}>
            <header style={{ marginBottom: 20 }}>
              <p className={styles.eyebrow}>CLIENT PORTAL</p>
              <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Messages</h1>
            </header>
            {/* Says which permission is missing and who can change it. An
                empty inbox here would read as "the clinic never writes to
                us", which is a different and worse message. */}
            <div className={styles.emptyBox}>
              <p style={{ margin: "0 0 8px", color: "var(--ink)", fontWeight: 600 }}>
                Messaging is not turned on for your account.
              </p>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Another adult on your family record may have it instead. The clinic can
                turn it on for you.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  const { family, threads, open, composing, now, loadError } = props;
  const nowDate = new Date(now);
  const names = new Map(family.children.map((c) => [c.clientId, displayName(c)]));

  async function post(url: string, payload: unknown) {
    setSending(true);
    setProblem(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(json.error || "Something went wrong. Try again shortly.");
        return null;
      }
      return json;
    } catch {
      // A failed fetch is almost always the connection. Saying so is more
      // useful than "an error occurred", and it tells the parent their message
      // is still in the box rather than lost.
      setProblem("Your message did not send. Check your connection and try again.");
      return null;
    } finally {
      setSending(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const issue = messageProblem(draft);
    if (issue) { setProblem(issue); return; }
    const json = await post("/api/messages/send", { threadId: open!.thread.threadId, body: draft });
    if (json) { setDraft(""); router.replace(router.asPath, undefined, { scroll: false }); }
  }

  async function startThread(e: React.FormEvent) {
    e.preventDefault();
    const subjectIssue = subjectProblem(subject);
    if (subjectIssue) { setProblem(subjectIssue); return; }
    const bodyIssue = messageProblem(draft);
    if (bodyIssue) { setProblem(bodyIssue); return; }
    const json = await post("/api/messages/start", {
      subject, body: draft, category,
      clientId: about === "" ? null : Number(about),
    });
    if (json?.threadId) {
      setSubject(""); setDraft("");
      router.push(`/messages?thread=${json.threadId}`);
    }
  }

  return (
    <>
      <MobileNavChrome title="Messages" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 22 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 16, flexWrap: "wrap",
            }}>
              <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>
                {open ? open.thread.subject : composing ? "New message" : "Messages"}
              </h1>
              {!open && !composing ? (
                <Link className={styles.textButton} href="/messages?new=1">
                  New message
                </Link>
              ) : (
                <Link className={styles.textButton} href="/messages">
                  Back to all messages
                </Link>
              )}
            </div>

            {!open && !composing ? (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Conversations with your clinic. Replies usually come within one business day.
              </p>
            ) : null}

            {open ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                {categoryLabel(open.thread.category)} · About{" "}
                {regardingLabel(open.thread, names)} · {statusLabel(open.thread.status)}
              </p>
            ) : null}
          </header>

          {loadError ? (
            <div className={styles.emptyBox} role="alert">
              Couldn&apos;t load your messages. Try refreshing the page.
            </div>
          ) : null}

          {problem ? (
            <div
              role="alert"
              style={{
                border: "1px solid #E0B4A6", background: "#FDF4F1", borderRadius: 10,
                padding: "12px 14px", marginBottom: 16, color: "#8A3B22", fontSize: 14,
              }}
            >
              {problem}
            </div>
          ) : null}

          {/* ----------------------------------------------------------- */}
          {/* Reading one conversation                                     */}
          {/* ----------------------------------------------------------- */}
          {open ? (
            <>
              <ol style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "grid", gap: 14 }}>
                {open.messages.map((m) => {
                  const fromClinic = m.authorKind === "staff";
                  return (
                    <li
                      key={m.id}
                      style={{
                        // Clinic messages sit left with a rule; the family's own
                        // sit right and tinted. Not two chat bubbles pretending
                        // to be a messaging app — a record of a conversation,
                        // where who said what has to survive being printed.
                        maxWidth: "min(660px, 92%)",
                        marginLeft: fromClinic ? 0 : "auto",
                        background: fromClinic ? "#fff" : "#F1F7F4",
                        border: `1px solid ${fromClinic ? "#dce8ee" : "#cfe3da"}`,
                        borderLeft: fromClinic ? "3px solid #0C5350" : undefined,
                        borderRadius: 10,
                        padding: "14px 16px",
                      }}
                    >
                      <p style={{
                        margin: "0 0 8px", fontSize: 13, color: "var(--muted)",
                        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                      }}>
                        <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                          {fromClinic ? (m.authorName ?? "Your clinic") : (m.authorName ?? "You")}
                        </strong>
                        <span>{whenLabel(m.createdAt, nowDate)}</span>
                      </p>
                      {/* preserve-line so a parent's paragraph breaks survive,
                          without dangerouslySetInnerHTML anywhere near text a
                          person typed. */}
                      <p style={{
                        margin: 0, color: "var(--ink)", lineHeight: 1.65,
                        whiteSpace: "pre-line", overflowWrap: "anywhere",
                      }}>
                        {m.body}
                      </p>

                      {m.attachments.length > 0 ? (
                        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
                          {m.attachments.map((a) => (
                            <li key={a.id} style={{ fontSize: 13, color: "var(--muted)" }}>
                              {a.fileName} · {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              <form onSubmit={sendReply} style={{ display: "grid", gap: 10, maxWidth: 660 }}>
                <label htmlFor="reply" style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>
                  Reply
                </label>
                <textarea
                  id="reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  placeholder="Write your reply"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: "1px solid #cddde4", font: "inherit", lineHeight: 1.6,
                    color: "var(--ink)", resize: "vertical",
                  }}
                />
                <div>
                  <button type="submit" disabled={sending} style={sendButton(sending)}>
                    {sending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {/* ----------------------------------------------------------- */}
          {/* Starting a conversation                                      */}
          {/* ----------------------------------------------------------- */}
          {composing ? (
            <form onSubmit={startThread} style={{ display: "grid", gap: 16, maxWidth: 660 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="about" style={fieldLabel}>Who is this about?</label>
                <select
                  id="about" value={about} onChange={(e) => setAbout(e.target.value)}
                  style={field}
                >
                  <option value="">Our family</option>
                  {family.children.map((c) => (
                    <option key={c.clientId} value={String(c.clientId)}>
                      {displayName(c)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="category" style={fieldLabel}>What is it about?</label>
                <select
                  id="category" value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                  style={field}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                  This decides who at the clinic picks it up first.
                </p>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="subject" style={fieldLabel}>Subject</label>
                <input
                  id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}
                  style={field} placeholder="Moving Tuesday's session"
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="body" style={fieldLabel}>Message</label>
                <textarea
                  id="body" value={draft} onChange={(e) => setDraft(e.target.value)}
                  rows={6} style={{ ...field, resize: "vertical", lineHeight: 1.6 }}
                />
              </div>

              {/* Said before they type, not after they send. This is a portal,
                  not an emergency line, and a family in crisis should not learn
                  that from a delayed reply. */}
              <p style={{
                margin: 0, fontSize: 13, color: "var(--muted)",
                borderLeft: "3px solid #d4e2e8", paddingLeft: 12, lineHeight: 1.6,
              }}>
                Messages are answered during clinic hours. If this is an emergency,
                call emergency services.
              </p>

              <div>
                <button type="submit" disabled={sending} style={sendButton(sending)}>
                  {sending ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          ) : null}

          {/* ----------------------------------------------------------- */}
          {/* The inbox                                                    */}
          {/* ----------------------------------------------------------- */}
          {!open && !composing ? (
            threads.length === 0 ? (
              <div className={styles.emptyBox}>
                <p style={{ margin: "0 0 6px", color: "var(--ink)", fontWeight: 600 }}>
                  No messages yet.
                </p>
                <p style={{ margin: "0 0 14px", color: "var(--muted)" }}>
                  Ask about scheduling, funding, forms, or anything about your child&apos;s care.
                </p>
                <Link className={styles.textButton} href="/messages?new=1">
                  Start a conversation
                </Link>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                {threads.map((t) => {
                  const unread = t.unreadCount > 0;
                  return (
                    <li key={t.threadId}>
                      <Link
                        href={`/messages?thread=${t.threadId}`}
                        style={{
                          display: "flex", gap: 14, alignItems: "flex-start",
                          padding: "16px 14px", textDecoration: "none",
                          borderBottom: "1px solid #e6eef2",
                          // Unread is weight and a dot, never colour alone.
                          background: unread ? "#F7FBFA" : "transparent",
                        }}
                      >
                        <FamilyAvatar
                          label={regardingLabel(t, names)}
                          clientId={t.clientId}
                          size={34}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: "flex", justifyContent: "space-between",
                            gap: 12, alignItems: "baseline", flexWrap: "wrap",
                          }}>
                            <span style={{
                              color: "var(--ink)", fontWeight: unread ? 700 : 600, fontSize: 15,
                            }}>
                              {t.subject}
                            </span>
                            <span style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}>
                              {whenLabel(t.lastMessageAt, nowDate)}
                            </span>
                          </span>

                          <span style={{
                            display: "block", color: "var(--muted)", fontSize: 13, margin: "3px 0 6px",
                          }}>
                            {regardingLabel(t, names)} · {categoryLabel(t.category)}
                          </span>

                          <span style={{
                            display: "block", color: unread ? "var(--ink)" : "var(--muted)",
                            fontSize: 14, overflowWrap: "anywhere",
                          }}>
                            {t.lastMessageFrom === "staff" ? "Clinic: " : t.lastMessageFrom === "family" ? "You: " : ""}
                            {previewOf(t.lastMessagePreview)}
                          </span>
                        </span>

                        {unread ? (
                          <span style={{
                            background: "#0C5350", color: "#fff", borderRadius: 999,
                            fontSize: 12, fontWeight: 700, padding: "2px 8px", flexShrink: 0,
                          }}>
                            {t.unreadCount}
                            <span style={visuallyHidden}> unread messages</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </main>
      </div>
    </>
  );
}

const fieldLabel: React.CSSProperties = { fontWeight: 600, color: "var(--ink)", fontSize: 14 };
const field: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  border: "1px solid #cddde4", font: "inherit", color: "var(--ink)", background: "#fff",
};
const visuallyHidden: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};
function sendButton(busy: boolean): React.CSSProperties {
  return {
    padding: "11px 20px", minHeight: 44, borderRadius: 999, border: "1px solid #0C5350",
    background: busy ? "#5a8a86" : "#0C5350", color: "#fff", fontWeight: 600,
    fontSize: 15, cursor: busy ? "progress" : "pointer",
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, query }) => {
  const supabase = createClient(req as NextApiRequest, res as NextApiResponse);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      redirect: {
        destination: process.env.NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const { data: familyRows, error: familyError } = await supabase
    .from("my_family")
    .select("client_id, client_name, client_status, preferred_name, date_of_birth, household_id, household_name, relationship, permissions");

  if (familyError) {
    console.error("messages: family load failed:", familyError.message);
    return { props: { mode: "error" } };
  }

  const family = familyFromRows(familyRows ?? []);

  // A signed-in user with no family record is staff who wandered in, or an
  // account mid-setup. Staff go to their own portal; the rest see the
  // no-access explanation rather than an empty inbox.
  if (family.children.length === 0) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role && profile.role !== "client") {
      return { redirect: { destination: homeUrlFor(profile.role), permanent: false } };
    }
    return { props: { mode: "no-access" } };
  }

  // The UI mirror of the RLS rule, so the portal does not offer a compose box
  // that the database would refuse. RLS is what enforces it.
  if (!canForAny(family, "message_clinic")) {
    return { props: { mode: "no-access" } };
  }

  const { data: threadRows, error: threadError } = await supabase
    .from("my_message_threads")
    .select("*")
    .order("last_message_at", { ascending: false });

  if (threadError) console.error("messages: thread load failed:", threadError.message);

  const threads = sortThreads(threadsFromRows(threadRows ?? []));
  const wanted = typeof query.thread === "string" ? query.thread : null;
  const composing = query.new === "1" && !wanted;

  let open: { thread: Thread; messages: Message[] } | null = null;

  if (wanted) {
    const thread = threads.find((t) => t.threadId === wanted) ?? null;
    if (!thread) {
      // Not in the inbox means RLS did not return it. Same answer as a thread
      // that does not exist, deliberately.
      return { redirect: { destination: "/messages", permanent: false } };
    }

    const { data: messageRows, error: messageError } = await supabase
      .from("messages")
      .select("id, body, author_kind, created_at, author_user_id, message_attachments(id, file_name, content_type, size_bytes)")
      .eq("thread_id", wanted)
      .order("created_at", { ascending: true });

    if (messageError) console.error("messages: message load failed:", messageError.message);

    open = {
      thread,
      messages: (messageRows ?? []).map((m: {
        id: string; body: string; author_kind: string; created_at: string;
        author_user_id: string;
        message_attachments?: { id: string; file_name: string; content_type: string; size_bytes: number | string }[];
      }) => ({
        id: m.id,
        body: m.body,
        authorKind: m.author_kind === "staff" ? "staff" as const : "family" as const,
        // Staff names are not read here: `profiles` is not readable by a family
        // session, and a join that silently returns null would render as an
        // unnamed sender. "Your clinic" is the honest label until a
        // family-safe display name exists — logged in BLOCKED-client.md.
        authorName: m.author_user_id === user.id ? "You" : null,
        createdAt: m.created_at,
        attachments: (m.message_attachments ?? []).map((a) => ({
          id: a.id, fileName: a.file_name, contentType: a.content_type,
          sizeBytes: Number(a.size_bytes),
        })),
      })),
    };
  }

  return {
    props: {
      mode: "inbox",
      family,
      threads,
      open,
      composing,
      // One clock. Computing "3 hours ago" independently on the server and
      // again in the browser is the classic hydration mismatch, and it shows
      // up as a React warning plus a visibly flickering timestamp.
      now: new Date().toISOString(),
      loadError: Boolean(threadError),
    },
  };
};
