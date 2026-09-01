/**
 * Care-team messaging. A family sends a message to their child's care team
 * and sees replies - one thread per client (client_messages, migration
 * 0035; see that file for the schema/RLS reasoning, and Sidebar.tsx's
 * "Messages" entry, "Soon" until this page existed).
 *
 * No realtime/websocket anywhere here, by design (poll-on-load or manual
 * refresh is the agreed v1 shape): the thread loads once via
 * getServerSideProps like every other page in this app, sending refetches
 * it with router.replace(router.asPath), and there's a manual Refresh
 * button for "did my clinician reply yet" without sending anything first.
 * apps/data's reply UI (a separate build) reads/writes the same table under
 * the same RLS, so nothing here is client-portal-specific at the schema
 * level - only this page's request/response shape is.
 */
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type Message = {
  id: string;
  body: string;
  sender_user_id: string;
  sender_role: string;
  created_at: string;
};

type PageProps =
  | {
      mode: "messages";
      messages: Message[];
      messagesError: boolean;
      clientName: string;
      currentUserId: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  clinician: "Clinician",
  scheduler: "Scheduler",
  client: "You",
};

export default function Messages(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }
  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { messages, messagesError, clientName, currentUserId, isAdminViewingAs } = props;
  const router = useRouter();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setRefreshing(true);
    await router.replace(router.asPath, undefined, { scroll: false });
    setRefreshing(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (!res.ok) {
        const text = await res.text();
        setSendError(text || "Could not send your message. Try again.");
        return;
      }

      setDraft("");
      // Full SSR refetch, same as the manual Refresh button - the point of
      // "poll-on-load or manual refresh" is that a page load is the only
      // moment this ever queries the thread, and sending one counts as that.
      await router.replace(router.asPath, undefined, { scroll: false });
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError("Could not send your message. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Messages" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Messages</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Send a note to {clientName}&apos;s care team and see their replies here.
            </p>
          </header>

          <div className={styles.threadToolbar}>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={refresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {messagesError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s messages. Try refreshing the page.
            </div>
          ) : (
            <div className={styles.threadCard}>
              <div className={styles.threadScroll} ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className={styles.emptyBox} style={{ margin: "auto" }}>
                    No messages yet. Send a note to {clientName}&apos;s care team below and
                    they&apos;ll reply here.
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_user_id === currentUserId;
                    const label = mine
                      ? "You"
                      : ROLE_LABEL[m.sender_role] ?? "Care team";
                    return (
                      <div
                        key={m.id}
                        className={`${styles.messageRow} ${
                          mine ? styles.messageRowMine : styles.messageRowTheirs
                        }`}
                      >
                        <span className={styles.messageSender}>{label}</span>
                        <div
                          className={`${styles.messageBubble} ${
                            mine ? styles.messageBubbleMine : styles.messageBubbleTheirs
                          }`}
                        >
                          {m.body}
                        </div>
                        <span className={styles.messageTime}>{formatTimestamp(m.created_at)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {isAdminViewingAs ? (
                <p className={styles.composeDisabledNotice}>
                  Sending is disabled while viewing as {clientName}. Messages can only be sent
                  from the family&apos;s own account.
                </p>
              ) : (
                <form className={styles.composeBar} onSubmit={handleSend}>
                  <textarea
                    className={styles.composeInput}
                    placeholder={`Message ${clientName}'s care team…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    disabled={sending}
                    maxLength={4000}
                    rows={1}
                  />
                  <button
                    type="submit"
                    className={styles.composeSendButton}
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
              )}
            </div>
          )}

          {sendError ? (
            <p style={{ margin: "10px 2px 0", color: "var(--danger)", fontSize: 12.5 }}>
              {sendError}
            </p>
          ) : null}
        </main>
      </div>
    </>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  req,
  res,
}) => {
  const supabase = createClient(
    req as NextApiRequest,
    res as NextApiResponse
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      redirect: {
        destination:
          process.env.NEXT_PUBLIC_LOGIN_URL ||
          "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const resolved = await resolveViewedClient(supabase, req as NextApiRequest, user.id);

  if (resolved.kind === "error") {
    return { props: { mode: "error" } };
  }
  if (resolved.kind === "needs-selection") {
    return { redirect: { destination: "/", permanent: false } };
  }
  if (resolved.kind === "account-problem") {
    return { props: { mode: "problem", problem: resolved.problem } };
  }
  if (resolved.kind === "not-permitted") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  // RLS (client_messages_client_read / client_messages_staff_read) is what
  // actually scopes this to viewed.clientId's own thread - the .eq() here
  // is belt-and-suspenders, same posture as every other query in this file.
  const { data: messages, error: messagesError } = await supabase
    .from("client_messages")
    .select("id, body, sender_user_id, sender_role, created_at")
    .eq("client_id", viewed.clientId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error("Failed to load messages:", messagesError.message);
  }

  return {
    props: {
      mode: "messages",
      messages: (messages ?? []) as Message[],
      messagesError: Boolean(messagesError),
      clientName: viewed.clientName || "your child",
      currentUserId: user.id,
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
