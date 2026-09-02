import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { CalendarMonth, type CalendarEntry } from "../components/calendar-month";
import { RequestChangeModal } from "../components/request-change-modal";
import { CalendarFeedSubscribe } from "../components/calendar-feed-subscribe";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { clinicTodayDateStr } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import type { ChangeRequest, ChangeRequestType } from "../lib/session-change-requests";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";
import { FamilySwitcher } from "../components/family-switcher";
import {
  can, childById, displayName, familyFromRows, recallView, rememberView,
  type Family, type FamilyView,
} from "../lib/family";

type SessionStatus = "scheduled" | "completed" | "cancelled";

type Session = {
  id: number;
  /** Which child. Present since the calendar became family-wide. */
  client_id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  status: string | null;
  is_home_visit: boolean;
  home_address: string | null;
  staff: {
    name: string | null;
  }[];
  locations: {
    name: string | null;
  }[];
};

type PageProps =
  | {
      mode: "appointments";
      /** Every child this guardian may see appointments for, not just one. */
      family: Family;
      sessions: Session[];
      sessionsError: boolean;
      changeRequests: ChangeRequest[];
      changeRequestsError: boolean;
      clientName: string;
      isAdminViewingAs: boolean;
      todayDateStr: string;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

/** The child's name for a session, or a neutral word if they are no longer
 *  on this guardian's record. Never the raw client id. */
function childName(family: Family, clientId: number): string {
  const child = childById(family, clientId);
  return child ? displayName(child) : "Your family";
}

type Filter = "All" | "Scheduled" | "Completed" | "Cancelled";
type ViewMode = "list" | "calendar";

/** Stable empty family for the non-appointments branches: an inline object
 *  would be a new reference every render and re-fire the effect below. */
const EMPTY_FAMILY: Family = { householdId: null, householdName: null, children: [] };

export default function Appointments(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  // Defaults to "Scheduled" rather than "All" - the dashboard's "Upcoming
  // Sessions" card links here as "View all", and a family arriving from
  // there (or from the nav) should land on what's actually upcoming, not on
  // an ascending-date list that opens with the oldest already-happened
  // session first. Full history is still one tap away via the same tabs.
  const [filter, setFilter] = useState<Filter>("Scheduled");

  // Which child the calendar is pointed at. Starts on "everyone", then the
  // remembered choice is applied in an effect - reading localStorage during
  // render would give the server and the browser different first paints.
  const [view, setView] = useState<FamilyView>({ kind: "family" });

  // Hoisted above the mode branches below, along with the calendar memo further
  // down. React counts hooks per render: one placed after an early return runs
  // on the appointments branch and not on problem or error, which throws
  // "Rendered more hooks than during the previous render" the moment a mount
  // changes mode. Reads props defensively because the other branches return
  // before any of this is used.
  const familyForHooks = props.mode === "appointments" ? props.family : EMPTY_FAMILY;
  const memoryKey = familyForHooks.householdId ?? "anon";
  useEffect(() => {
    setView(recallView(memoryKey, familyForHooks));
  }, [memoryKey, familyForHooks]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>(
    props.mode === "appointments" ? props.changeRequests : []
  );
  const [requestModal, setRequestModal] = useState<{
    sessionId: number;
    sessionLabel: string;
    requestType: ChangeRequestType;
  } | null>(null);

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { family, sessions, sessionsError, clientName, isAdminViewingAs, todayDateStr } = props;

  // Keyed on the household, same as the dashboard, so switching child there
  // and navigating here does not silently switch back.
  // A legacy single-child account resolves through clients.user_id and has no
  // my_family rows at all, so there is no permission set to consult. Treating
  // that as "no permission" would silently remove the request buttons from
  // every family that predates the household model - which is the opposite of
  // what adding a permission check is for.
  const legacyAccount = family.children.length === 0;
  const mayManage = (clientId: number) =>
    legacyAccount || can(childById(family, clientId), "manage_appointments");

  function onSwitch(next: FamilyView) {
    setView(next);
    rememberView(memoryKey, next);
    // A date selected in calendar mode belonged to the previous child's
    // sessions. Clearing it avoids an empty list with no visible reason.
    setSelectedDate(null);
  }

  // changeRequests is ordered newest-first by the query below, so the first
  // request seen per session here is that session's latest - one lookup per
  // card instead of re-scanning the array for every session in the list.
  const latestRequestBySession = new Map<number, ChangeRequest>();
  for (const request of changeRequests) {
    if (!latestRequestBySession.has(request.session_id)) {
      latestRequestBySession.set(request.session_id, request);
    }
  }

  // The switcher narrows first, then the status tabs. A family of one never
  // sees the switcher at all (it renders nothing), so this is a no-op there.
  const familySessions =
    view.kind === "child"
      ? sessions.filter((session) => session.client_id === view.clientId)
      : sessions;

  const filteredSessions =
    filter === "All"
      ? familySessions
      : familySessions.filter(
          (session) =>
            normalizeStatus(session.status, session.session_date, todayDateStr) ===
            filter.toLowerCase()
        );

  // The calendar grid needs every filtered session's derived status for its
  // colour-coded chips - normalizeStatus() is the single source of truth
  // for scheduled/completed/cancelled, computed once here rather than
  // re-derived inside CalendarMonth (which stays presentation-only, no
  // knowledge of what "completed" means).
  // Was a useMemo, which sat after the early returns and had the same
  // hook-order problem. Mapping a few hundred sessions per render is cheaper
  // than the bug it was causing.
  const calendarEntries: CalendarEntry[] = (
    (() =>
      filteredSessions.map((session) => ({
        id: session.id,
        session_date: session.session_date,
        status: normalizeStatus(session.status, session.session_date, todayDateStr),
        // On a shared calendar the child's name comes first: a parent
        // scanning Tuesday needs to know whose session it is before they
        // need to know what kind it is.
        label: view.kind === "family" && family.children.length > 1
          ? `${childName(family, session.client_id)} · ${formatSessionTime(session.hour, session.minute)}`
          : `${formatSessionTime(session.hour, session.minute)} ${session.type || "Session"}`,
      })))()
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

      <main className={styles.main}>
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
                color: "var(--ink)",
              }}
            >
              Appointments
            </h1>

            <p
              style={{
                margin: 0,
                color: "var(--muted)",
              }}
            >
              {view.kind === "child"
                ? `Scheduled and past sessions for ${childName(family, view.clientId)}.`
                : family.children.length > 1
                  ? "Scheduled and past sessions across your family."
                  : "View your scheduled and past sessions."}
            </p>

            {/* Renders nothing for a family of one. Placed under the heading
                rather than beside the .ics link so it reads as part of what
                the page is showing, not as another action. */}
            <div style={{ marginTop: 14 }}>
              <FamilySwitcher family={family} view={view} onChange={onSwitch} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            {/* One-time file download (see pages/api/calendar.ics.ts's
                header comment) - a plain link is enough, no JS needed to
                trigger it. */}
            <a
              href="/api/calendar.ics"
              className={styles.textButton}
              style={{ whiteSpace: "nowrap" }}
            >
              Download calendar (.ics)
            </a>

            {/* Real webcal:// subscription (migration 0044) - a family's
                own account only, never rendered during admin "view as" (see
                CalendarFeedSubscribe's own header for why). */}
            {!isAdminViewingAs && <CalendarFeedSubscribe />}
          </div>
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
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
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
              const location = formatSessionLocation(session);
              // Reuses the dashboard's own status pill classes (same
              // confirmed/cancelled/completed tokens as design-b.tsx's
              // statusClass()) instead of a second hardcoded colour map -
              // "scheduled" maps to the same green as the dashboard's
              // default case.
              const statusClassName = status === "scheduled" ? "confirmed" : status;

              // Reschedule/cancel requests only make sense for a session
              // that's still upcoming (not already cancelled or in the
              // past), and never for an admin's read-only "view as" - see
              // pages/api/sessions/request-change.ts's own header for why
              // that second condition matters, not just this one.
              // Per child, not per family. A guardian can hold view_appointments
              // for a sibling and manage_appointments only for their own child;
              // showing them a button the database will refuse is worse than
              // not showing it. RLS is still the boundary - this is the UI not
              // offering what would fail.
              const canRequestChange =
                status === "scheduled" && !isAdminViewingAs && mayManage(session.client_id);
              const existingRequest = latestRequestBySession.get(session.id);
              const hasPendingRequest = existingRequest?.status === "pending";

              const sessionLabel = `${session.type || "Session"} · ${formatSessionDate(
                session.session_date
              )} at ${formatSessionTime(session.hour, session.minute)}`;

              return (
                <article key={session.id} className={styles.apptCard}>
                  <div className={styles.apptCardTop}>
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
                        {location && <span>{location}</span>}
                      </div>
                    </div>

                    <span
                      className={`${styles.status} ${styles[statusClassName]}`}
                      style={{ textTransform: "capitalize" }}
                    >
                      {status}
                    </span>
                  </div>

                  {canRequestChange && (
                    hasPendingRequest ? (
                      <span className={`pill warn ${styles.requestPill}`}>
                        {existingRequest?.request_type === "cancel"
                          ? "Cancellation requested — awaiting staff"
                          : "Reschedule requested — awaiting staff"}
                      </span>
                    ) : (
                      <div className={styles.requestActions}>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() =>
                            setRequestModal({
                              sessionId: session.id,
                              sessionLabel,
                              requestType: "reschedule",
                            })
                          }
                        >
                          Request reschedule
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() =>
                            setRequestModal({
                              sessionId: session.id,
                              sessionLabel,
                              requestType: "cancel",
                            })
                          }
                        >
                          Request cancellation
                        </button>
                      </div>
                    )
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>

    {requestModal && (
      <RequestChangeModal
        sessionId={requestModal.sessionId}
        sessionLabel={requestModal.sessionLabel}
        requestType={requestModal.requestType}
        onClose={() => setRequestModal(null)}
        onSubmitted={(request) => {
          // Prepended, not appended - changeRequests is read newest-first
          // everywhere else in this file (the latestRequestBySession map
          // above, and the same ordering the server query itself uses), so
          // the just-submitted request has to land at the front to be
          // picked up as this session's latest without a re-fetch.
          setChangeRequests((current) => [request, ...current]);
          setRequestModal(null);
        }}
      />
    )}
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

  const { data: familyRows, error: familyError } = await supabase
    .from("my_family")
    .select("client_id, client_name, client_status, preferred_name, date_of_birth, household_id, household_name, relationship, permissions");
  if (familyError) console.error("Failed to load family:", familyError.message);

  const family = familyFromRows(familyRows ?? []);

  // Only children this guardian may actually see appointments for. A child
  // they hold view_profile but not view_appointments for belongs in the
  // switcher (they are still family) but not in this query.
  const accessibleIds = family.children
    .filter((c) => can(c, "view_appointments"))
    .map((c) => c.clientId);
  // A legacy single-child account resolves through clients.user_id and has no
  // my_family rows; fall back to the resolved child so the page still works.
  if (accessibleIds.length === 0) accessibleIds.push(Number(viewed.clientId));

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(`
      id,
      client_id,
      session_date,
      hour,
      minute,
      type,
      status,
      is_home_visit,
      home_address,
      staff (
        name
      ),
      locations (
        name
      )
    `)
    // Every child this guardian may see, not just the one the portal is
    // pointed at. RLS (sessions_family_read, migration 0046) already limits
    // this to children they hold view_appointments for; the .in() is the app
    // not asking for what the database would refuse.
    .in("client_id", accessibleIds)
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

  // Every reschedule/cancel request this family has ever filed, newest
  // first - pages/api/sessions/request-change.ts is the only writer.
  // Skipped for an admin's "view as" (see that endpoint's own header for why
  // the write path itself is blocked too): resolveViewedClient's admin
  // branch signs the caller in as an admin, not a client, and the
  // session_change_requests_client_select RLS policy (migration 0035) only
  // ever matches auth_role() = 'client' - an admin's own query here would
  // just come back empty under RLS rather than erroring, but there's no
  // reason to spend the round trip on a screen that never renders anything
  // from it.
  const { data: changeRequests, error: changeRequestsError } = viewed.isAdminViewingAs
    ? { data: [] as ChangeRequest[], error: null }
    : await supabase
        .from("session_change_requests")
        .select("id, session_id, request_type, status, created_at")
        .eq("client_id", viewed.clientId)
        .order("created_at", { ascending: false });

  if (changeRequestsError) {
    console.error("Failed to load session change requests:", changeRequestsError.message);
  }

  return {
    props: {
      mode: "appointments",
      family,
      sessions: (sessions ?? []) as Session[],
      sessionsError: Boolean(sessionsError),
      changeRequests: (changeRequests ?? []) as ChangeRequest[],
      changeRequestsError: Boolean(changeRequestsError),
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

/**
 * "Home visit" takes priority over any assigned `locations` row - a session
 * can carry both (0018's backfill set location_id from the assigned
 * clinician's own site before is_home_visit existed), and when a session is
 * actually a home visit that's the address that matters to the family, not
 * the clinician's home site. home_address is optional even for a home visit
 * (not every historical row has one), so "Home visit" alone is still a
 * meaningful, honest fallback rather than showing nothing.
 */
function formatSessionLocation(session: Session): string | null {
  if (session.is_home_visit) {
    return session.home_address ? `Home visit — ${session.home_address}` : "Home visit";
  }

  return session.locations?.[0]?.name || null;
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
