import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { CalendarMonth, type CalendarEntry } from "../components/calendar-month";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { clinicTodayDateStr } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type SessionStatus = "scheduled" | "completed" | "cancelled";

type Session = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  status: string | null;
  staff: {
    name: string | null;
  }[];
};

type PageProps =
  | {
      mode: "appointments";
      sessions: Session[];
      sessionsError: boolean;
      clientName: string;
      isAdminViewingAs: boolean;
      todayDateStr: string;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

type Filter = "All" | "Scheduled" | "Completed" | "Cancelled";
type ViewMode = "list" | "calendar";

export default function Appointments(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [filter, setFilter] = useState<Filter>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { sessions, sessionsError, clientName, isAdminViewingAs, todayDateStr } = props;

  const filteredSessions =
    filter === "All"
      ? sessions
      : sessions.filter(
          (session) =>
            normalizeStatus(session.status, session.session_date, todayDateStr) ===
            filter.toLowerCase()
        );

  // The calendar grid needs every filtered session's derived status for its
  // colour-coded chips - normalizeStatus() is the single source of truth
  // for scheduled/completed/cancelled, computed once here rather than
  // re-derived inside CalendarMonth (which stays presentation-only, no
  // knowledge of what "completed" means).
  const calendarEntries: CalendarEntry[] = useMemo(
    () =>
      filteredSessions.map((session) => ({
        id: session.id,
        session_date: session.session_date,
        status: normalizeStatus(session.status, session.session_date, todayDateStr),
        label: `${formatSessionTime(session.hour, session.minute)} ${session.type || "Session"}`,
      })),
    [filteredSessions, todayDateStr]
  );

  // Calendar mode's day-click narrows the list below to just that date, on
  // top of whatever the status filter already narrowed it to - switching
  // back to List mode clears the date so it doesn't silently keep
  // filtering a view where there's no date picker visible to explain why.
  const visibleSessions =
    viewMode === "calendar" && selectedDate
      ? filteredSessions.filter((session) => session.session_date === selectedDate)
      : filteredSessions;

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    setSelectedDate(null);
  }

  return (
    <>
    {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
    <MobileNavChrome title="Appointments" />
    <div className={styles.page}>
      <Sidebar />

      <main
        className={styles.main}
        style={{
          background: "#edf7f8",
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>

            <h1
              style={{
                margin: "0 0 6px",
                color: "#173f5f",
              }}
            >
              Appointments
            </h1>

            <p
              style={{
                margin: 0,
                color: "#6c8290",
              }}
            >
              View your scheduled and past sessions.
            </p>
          </div>

          {/* One-time file download (not a subscribable feed - see
              pages/api/calendar.ics.ts's header comment for why), so a
              plain link is enough: no JS needed to trigger it. */}
          <a
            href="/api/calendar.ics"
            className={styles.textButton}
            style={{ whiteSpace: "nowrap" }}
          >
            Download calendar (.ics)
          </a>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div className={styles.filters} role="group" aria-label="Filter appointments by status">
            {(["All", "Scheduled", "Completed", "Cancelled"] as const).map(
              (option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  type="button"
                  aria-pressed={filter === option}
                  className={`${styles.filterButton} ${
                    filter === option ? styles.filterButtonActive : ""
                  }`}
                >
                  {option}
                </button>
              )
            )}
          </div>

          <div className={styles.filters} role="group" aria-label="Switch between list and calendar view">
            {(["list", "calendar"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchView(mode)}
                aria-pressed={viewMode === mode}
                className={`${styles.filterButton} ${
                  viewMode === mode ? styles.filterButtonActive : ""
                }`}
              >
                {mode === "list" ? "List" : "Calendar"}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "calendar" && !sessionsError && (
          <CalendarMonth
            entries={calendarEntries}
            todayDateStr={todayDateStr}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}

        {viewMode === "calendar" && selectedDate && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#6c8290" }}>
              Showing {formatSessionDate(selectedDate)} only
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className={styles.textButton}
              style={{ fontSize: 13 }}
            >
              Clear
            </button>
          </div>
        )}

        <section className={styles.apptList}>
          {sessionsError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load your appointments. Try refreshing the page.
            </div>
          ) : visibleSessions.length === 0 ? (
            <div className={styles.emptyBox}>
              {selectedDate ? "No appointments on this date." : "No appointments scheduled."}
            </div>
          ) : (
            visibleSessions.map((session) => {
              const status = normalizeStatus(session.status, session.session_date, todayDateStr);
              const clinicianName = session.staff?.[0]?.name;
              // Reuses the dashboard's own status pill classes (same
              // confirmed/cancelled/completed tokens as design-b.tsx's
              // statusClass()) instead of a second hardcoded colour map -
              // "scheduled" maps to the same green as the dashboard's
              // default case.
              const statusClassName = status === "scheduled" ? "confirmed" : status;

              return (
                <article key={session.id} className={styles.apptCard}>
                  <div>
                    <strong className={styles.apptTitle}>
                      {session.type || "Session"}
                    </strong>

                    <div className={styles.apptMeta}>
                      <span>
                        {formatSessionDate(session.session_date)} ·{" "}
                        {formatSessionTime(session.hour, session.minute)}
                      </span>

                      {clinicianName && <span>{clinicianName}</span>}
                    </div>
                  </div>

                  <span
                    className={`${styles.status} ${styles[statusClassName]}`}
                    style={{ textTransform: "capitalize" }}
                  >
                    {status}
                  </span>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
    </>
  );
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
    // The picker lives on the landing page, not here.
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

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(`
      id,
      session_date,
      hour,
      minute,
      type,
      status,
      staff (
        name
      )
    `)
    .eq("client_id", viewed.clientId)
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  // clinicTodayDateStr() (not new Date().toISOString()) so the
  // scheduled/completed split below is the clinic's own calendar day, not
  // the UTC server's - see lib/clinic-date.ts and the matching fix in
  // pages/index.tsx's "Upcoming Sessions" query.
  const todayDateStr = clinicTodayDateStr();

  if (sessionsError) {
    console.error("Failed to load appointments:", sessionsError.message);
  }

  return {
    props: {
      mode: "appointments",
      sessions: (sessions ?? []) as Session[],
      sessionsError: Boolean(sessionsError),
      clientName: viewed.clientName,
      isAdminViewingAs: viewed.isAdminViewingAs,
      todayDateStr,
    },
  };
};

/**
 * "Completed" was never a real value of sessions.status - the scheduler only
 * ever writes "scheduled" or "cancelled" to this column (confirmed by
 * reading every write path in apps/scheduler; nothing sets "completed"
 * anywhere). Every past session displayed as "Scheduled" forever, and the
 * Completed filter tab always returned nothing. Derived from the date
 * instead: a non-cancelled session in the past is complete, one today or
 * later is still scheduled. Same day-level boundary the dashboard's
 * "Upcoming Sessions" query uses, so the two pages agree on what counts as
 * upcoming vs. already happened.
 */
function normalizeStatus(
  status: string | null,
  sessionDate: string,
  todayDateStr: string
): SessionStatus {
  if (status?.toLowerCase() === "cancelled") {
    return "cancelled";
  }

  return sessionDate < todayDateStr ? "completed" : "scheduled";
}

function formatSessionDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${monthNames[month - 1]} ${day}`;
}

function formatSessionTime(
  hour: number | null,
  minute: number | null
) {
  if (hour === null) {
    return "Time not set";
  }

  const safeMinute = minute ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(safeMinute).padStart(
    2,
    "0"
  )} ${period}`;
}
