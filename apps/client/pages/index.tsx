import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import DesignB, {
  type DashboardSession,
  type DashboardProgram,
  type DashboardSoapNote,
} from "../components/design-b";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient, listClinicClients, type SelectableClient } from "../lib/admin-view-as";
import { clinicTodayDateStr } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { SelectClient } from "../components/select-client";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";

type DashboardProps = {
  mode: "dashboard";
  familyName: string;
  clientName: string;
  sessions: DashboardSession[];
  sessionsCount: number;
  sessionsError: boolean;
  programs: DashboardProgram[];
  programsError: boolean;
  soapNotes: DashboardSoapNote[];
  soapNotesError: boolean;
  isAdminViewingAs: boolean;
};

type SelectProps = {
  mode: "select";
  clients: SelectableClient[];
  clientsError: boolean;
};

type ProblemProps = {
  mode: "problem";
  problem: AccountProblem;
};

type ErrorProps = {
  mode: "error";
};

type PageProps = DashboardProps | SelectProps | ProblemProps | ErrorProps;

export default function ClientDashboard(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.mode === "select") {
    return <SelectClient clients={props.clients} error={props.clientsError} />;
  }

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  return (
    <>
      {props.isAdminViewingAs ? <AdminViewBanner clientName={props.clientName} /> : null}
      <DesignB {...props} />
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
    // The admin picker lives right here on the landing page, not a separate
    // route - the first thing an admin sees after following the nav link.
    const { clients, error: clientsError } = await listClinicClients(supabase, resolved.clinicId);
    return { props: { mode: "select", clients, clientsError } };
  }
  if (resolved.kind === "account-problem") {
    return { props: { mode: "problem", problem: resolved.problem } };
  }
  if (resolved.kind === "not-permitted") {
    // Some other staff role (scheduler, clinician, ...) reached this app -
    // proxy.ts only checks that *some* session exists, not which role. Send
    // them home instead of rendering anyone's PHI.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  // "Upcoming Sessions" - the card's own label - had no date filter at all,
  // so it fetched every session ever booked (past and future) in ascending
  // date order: with months of history, the card showed the oldest already-
  // happened session first, not what's actually coming up. Scoped to today
  // forward and capped to a handful for the dashboard snapshot; the full
  // history (including past sessions) is still one click away via
  // "View all" -> /appointments. clinicTodayDateStr() (not
  // new Date().toISOString()) so this cutoff is the clinic's own calendar
  // day, not the UTC server's - see lib/clinic-date.ts for why that
  // mattered here specifically.
  const todayDateStr = clinicTodayDateStr();
  // { count: "exact" } so `sessionsCount` below is the true number of
  // upcoming sessions, not just how many fit in this capped preview list -
  // the "Sessions / Upcoming" stat tile used to read `sessions.length`
  // directly, which is this same query's own .limit(5) result: a family
  // with 6+ upcoming sessions saw a tile permanently stuck at "5" no
  // matter how many they actually had booked. PostgREST returns the exact
  // total alongside the limited page in one round trip, so this doesn't
  // need a second query.
  const { data: sessions, error: sessionsError, count: sessionsCount } = await supabase
    .from("sessions")
    .select(
      `
      id,
      hour,
      minute,
      type,
      session_date,
      status
    `,
      { count: "exact" }
    )
    .eq("client_id", viewed.clientId)
    .gte("session_date", todayDateStr)
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true })
    .limit(5);

  if (sessionsError) {
    console.error(
      "Failed to load dashboard sessions:",
      sessionsError.message
    );
  }

  // Goals: migration 0020 scopes this to the signed-in family's own child
  // via RLS (programs_client_read) - the client_id filter here is
  // defense-in-depth, matching the same pattern sessions already uses,
  // not the only thing standing between one family and another's data.
  // Ordered by name from the DB; re-sorted by a deliberate status
  // priority below rather than alphabetically (see sortProgramsForFamily).
  const { data: programs, error: programsError } = await supabase
    .from("programs")
    .select("id, name, domain, status")
    .eq("client_id", viewed.clientId)
    .order("name", { ascending: true });

  if (programsError) {
    console.error("Failed to load dashboard programs:", programsError.message);
  }

  // SOAP notes: RLS (session_notes_client_read) also enforces status in
  // ('signed','countersigned') server-side - a draft is never selectable
  // here even if this query's own filter were ever removed by mistake.
  // nullsFirst: false because Postgres's default for `order by ... desc`
  // is NULLS FIRST: a note with no signed_at (if a countersigned note can
  // ever have one) would sort ahead of every actually-signed note
  // regardless of how recent it is, not to the back where a null date
  // belongs in a "most recent first" list.
  const { data: soapNotes, error: soapNotesError } = await supabase
    .from("session_notes")
    .select("id, status, signed_at, countersigned_at, body")
    .eq("client_id", viewed.clientId)
    .in("status", ["signed", "countersigned"])
    .order("signed_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (soapNotesError) {
    console.error("Failed to load dashboard SOAP notes:", soapNotesError.message);
  }

  const clientLastName = viewed.clientName
    ? viewed.clientName.trim().split(/\s+/).pop()
    : null;

  const familyName = clientLastName
    ? `${clientLastName} Family`
    : profile?.full_name || "Family";

  return {
    props: {
      mode: "dashboard",
      familyName,
      clientName: viewed.clientName || "Client",
      sessions: (sessions ?? []) as DashboardSession[],
      sessionsCount: sessionsCount ?? (sessions ?? []).length,
      sessionsError: Boolean(sessionsError),
      programs: sortProgramsForFamily((programs ?? []) as DashboardProgram[]),
      programsError: Boolean(programsError),
      soapNotes: (soapNotes ?? []) as DashboardSoapNote[],
      soapNotesError: Boolean(soapNotesError),
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};

/**
 * "Progress Snapshot" ordered goals alphabetically by status
 * ("active" < "archived" < "draft" < "maintenance" < "mastered" <
 * "on_hold" < "pending_signoff"), which put discontinued ("archived")
 * goals second - ahead of "maintenance", "mastered" and "on_hold" - for
 * no reason other than the letter A. Sorted by an explicit priority
 * instead: goals actively worked on first, then goals worth celebrating
 * or needing attention, then not-yet-visible internal states, archived
 * goals last since they're the least relevant to a family checking on
 * current progress. Name breaks ties within the same priority.
 */
const PROGRAM_STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  maintenance: 1,
  on_hold: 2,
  mastered: 3,
  pending_signoff: 4,
  draft: 5,
  archived: 6,
};

function sortProgramsForFamily(programs: DashboardProgram[]): DashboardProgram[] {
  return [...programs].sort((a, b) => {
    const priorityA = PROGRAM_STATUS_PRIORITY[a.status] ?? PROGRAM_STATUS_PRIORITY.draft;
    const priorityB = PROGRAM_STATUS_PRIORITY[b.status] ?? PROGRAM_STATUS_PRIORITY.draft;
    return priorityA !== priorityB ? priorityA - priorityB : a.name.localeCompare(b.name);
  });
}
