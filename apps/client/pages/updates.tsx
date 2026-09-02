import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { formatClinicDate } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";
import {
  announcementCategoryLabel, announcementsFromRows, sortAnnouncements,
  type Announcement,
} from "../lib/notifications";

/** Same shape as design-b.tsx's DashboardSoapNote - kept local rather than
 *  imported since this page's query selects the identical columns for a
 *  different purpose (full history, not a 5-row dashboard preview) and the
 *  two aren't meant to be forced to change together. */
type Note = {
  id: string;
  status: string;
  signed_at: string | null;
  countersigned_at: string | null;
  body: { familyUpdate?: string | null } | null;
};

type PageProps =
  | {
      mode: "updates";
      notes: Note[];
      notesError: boolean;
      /** Clinic-wide and household notices. See migration 0045. */
      announcements: Announcement[];
      clientName: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

/**
 * Full care-update history - the dashboard's "Recent Updates" card has
 * always capped itself at 5 signed/countersigned session notes with no way
 * to see anything older, and (unlike sessions) had no dedicated page at
 * all. This is that page: every signed/countersigned note, newest first,
 * each one labeled with whether it was countersigned (reviewed by a
 * supervisor, not just the treating clinician) so a family can tell the
 * two apart - the dashboard card never surfaced that distinction either.
 */
export default function Updates(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { notes, notesError, announcements, clientName, isAdminViewingAs } = props;

  return (
    <>
      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Care Updates" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Care Updates</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Notices from the clinic, and notes from {clientName}&apos;s clinical team.
            </p>
          </header>

          {/* Clinic notices sit above the clinical notes rather than in a
              separate page. They are the thing most likely to be time-bound -
              a closure, a policy change - and a family should not have to know
              which of two pages a message landed on. Nothing here is
              per-child: an announcement is addressed to the household. */}
          {announcements.length > 0 ? (
            <section aria-label="Notices from the clinic" style={{ marginBottom: 28 }}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                {announcements.map((a) => (
                  <li
                    key={a.announcementId}
                    id={`announcement-${a.announcementId}`}
                    style={{
                      // Urgent is a heavier left rule and a word, never colour
                      // alone: the label below says "Urgent" in text.
                      borderLeft: `3px solid ${a.isUrgent ? "#8A3B22" : "#0C5350"}`,
                      background: a.isUnread ? "#F7FBFA" : "#fff",
                      border: "1px solid #dce8ee",
                      borderLeftWidth: 3,
                      borderLeftColor: a.isUrgent ? "#8A3B22" : "#0C5350",
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    <p style={{
                      margin: "0 0 6px", fontSize: 12, letterSpacing: ".04em",
                      textTransform: "uppercase", fontWeight: 700,
                      color: a.isUrgent ? "#8A3B22" : "var(--muted)",
                    }}>
                      {a.isUrgent ? "Urgent · " : ""}{announcementCategoryLabel(a.category)}
                    </p>
                    <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--ink)" }}>
                      {a.title}
                    </h2>
                    <p style={{
                      margin: 0, color: "var(--ink)", lineHeight: 1.65,
                      whiteSpace: "pre-line", overflowWrap: "anywhere",
                    }}>
                      {a.body}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <h2 style={{ fontSize: 15, margin: "0 0 12px", color: "var(--muted)",
                       letterSpacing: ".03em", textTransform: "uppercase" }}>
            Session notes
          </h2>

          {notesError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s updates. Try refreshing the page.
            </div>
          ) : notes.length === 0 ? (
            <div className={styles.emptyBox}>
              No updates yet. Session updates will appear here once your clinical team shares one.
            </div>
          ) : (
            <div className={styles.updateList}>
              {notes.map((note) => {
                const isCountersigned = note.status === "countersigned";
                const date = formatUpdateDate(note);

                return (
                  <article key={note.id} className={styles.updateCard}>
                    <div className={styles.updateCardHeader}>
                      <span className={styles.updateDate}>{date}</span>
                      <span
                        className={`${styles.noteBadge} ${
                          isCountersigned ? styles.noteBadgeCountersigned : styles.noteBadgeSigned
                        }`}
                      >
                        {isCountersigned ? "Reviewed by supervisor" : "Signed"}
                      </span>
                    </div>
                    <p className={styles.updateBody}>
                      {note.body?.familyUpdate || "No summary available for this update."}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function formatUpdateDate(note: Note): string {
  const iso = note.countersigned_at ?? note.signed_at;
  return iso ? formatClinicDate(iso) : "Recently";
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

  // Same table/columns/scoping as the dashboard's Recent Updates query
  // (pages/index.tsx) - RLS (session_notes_client_read) enforces
  // status in ('signed', 'countersigned') server-side regardless of this
  // query's own .in() filter, same as there. No .limit() here - the whole
  // point of this page is the full history, not a preview. Ordered by
  // signed_at from the DB as a reasonable default; re-sorted below by the
  // actual intended key (see mostRecentFirst) since that key isn't a
  // single column PostgREST's .order() can express.
  const { data: notes, error: notesError } = await supabase
    .from("session_notes")
    .select("id, status, signed_at, countersigned_at, body")
    .eq("client_id", viewed.clientId)
    .in("status", ["signed", "countersigned"])
    .order("signed_at", { ascending: false, nullsFirst: false });

  if (notesError) {
    console.error("Failed to load updates page notes:", notesError.message);
  }

  // Announcements are addressed to the household, so unlike the notes above
  // they are not filtered to the child being viewed. A load failure here is
  // deliberately not fatal to the page: a family should still get their
  // clinical notes if the notice board is having a bad day.
  const { data: annRows, error: annError } = await supabase
    .from("my_announcements")
    .select("announcement_id, title, body, category, is_urgent, publish_at, is_unread");
  if (annError) {
    console.error("Failed to load announcements:", annError.message);
  }

  return {
    props: {
      mode: "updates",
      announcements: sortAnnouncements(announcementsFromRows(annRows ?? [])),
      notes: mostRecentFirst((notes ?? []) as Note[]),
      notesError: Boolean(notesError),
      clientName: viewed.clientName || "Client",
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};

/**
 * "Most recent first" means countersigned_at when a note has been
 * countersigned (a supervisor reviewing it is the more meaningful, later
 * milestone) and signed_at otherwise - i.e. coalesce(countersigned_at,
 * signed_at) desc. PostgREST's .order() only takes a column name, not a
 * computed expression, so two chained .order() calls would sort by
 * countersigned_at as the PRIMARY key - putting every merely-signed note
 * (countersigned_at always null) after every countersigned note
 * regardless of actual recency, not what "most recent first" means.
 * Sorted client-side instead, the same reason lib/program-display.ts's
 * sortProgramsForFamily runs in JS rather than in the query.
 */
function mostRecentFirst(notes: Note[]): Note[] {
  const mostRecentDate = (note: Note) => note.countersigned_at ?? note.signed_at ?? "";
  return [...notes].sort((a, b) => mostRecentDate(b).localeCompare(mostRecentDate(a)));
}
