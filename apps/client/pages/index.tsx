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
import { positionOf, totalPosition, type BudgetEntry, type ClientBudget } from "../lib/budget";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient, listClinicClients, type SelectableClient } from "../lib/admin-view-as";
import { clinicTodayDateStr } from "../lib/clinic-date";
import { sortProgramsForFamily } from "../lib/program-display";
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
  budget: {
    allocated: number; spent: number; remaining: number; percentUsed: number; currency: string;
    count: number;
  } | null;
  budgetError: boolean;
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
  // Budgets: funding-source agnostic. RLS (client_budgets_client_read) scopes
  // these to the signed-in family's own child; the client_id filter is
  // defense-in-depth, matching the pattern above. Spent-to-date is summed
  // from entries rather than read off a stored total, so the dashboard and
  // the statement can never disagree.
  const { data: budgetRows, error: budgetsError } = await supabase
    .from("client_budgets")
    .select("id, client_id, name, funding_source, reference, allocated_amount, currency, period_start, period_end, status, notes")
    .eq("client_id", viewed.clientId)
    .neq("status", "CLOSED")
    .order("period_start", { ascending: false });

  if (budgetsError) {
    console.error("Failed to load client budgets:", budgetsError.message);
  }

  const budgetIds = (budgetRows ?? []).map((b) => b.id as string);
  const { data: entryRows, error: entriesError } = budgetIds.length
    ? await supabase
        .from("budget_entries")
        .select("id, budget_id, entry_date, kind, description, session_id, service_type, quantity, unit_rate, amount, reconciled")
        .in("budget_id", budgetIds)
    : { data: [], error: null };

  if (entriesError) {
    console.error("Failed to load budget entries:", entriesError.message);
  }

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
      budget: summarizeBudgets(budgetRows ?? [], entryRows ?? []),
      // Either read failing makes the total wrong, not merely incomplete: a
      // missing entry understates spend, and a missing budget hides the
      // allocation it was spent against. Both roll into one flag so the card
      // says it could not load rather than showing a confident wrong number.
      budgetError: Boolean(budgetsError || entriesError),
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};


/** Database rows to the shapes the budget library works in. */
function toBudget(r: Record<string, unknown>): ClientBudget {
  return {
    id: r.id as string,
    clientId: Number(r.client_id),
    name: r.name as string,
    fundingSource: r.funding_source as string,
    reference: (r.reference as string) ?? null,
    allocatedAmount: Number(r.allocated_amount),
    currency: (r.currency as string) ?? "CAD",
    periodStart: r.period_start as string,
    periodEnd: (r.period_end as string) ?? null,
    status: r.status as ClientBudget["status"],
    notes: (r.notes as string) ?? null,
  };
}

function toEntry(r: Record<string, unknown>): BudgetEntry {
  return {
    id: r.id as string,
    budgetId: r.budget_id as string,
    entryDate: r.entry_date as string,
    kind: r.kind as BudgetEntry["kind"],
    description: r.description as string,
    sessionId: r.session_id == null ? null : Number(r.session_id),
    serviceType: (r.service_type as string) ?? null,
    quantity: r.quantity == null ? null : Number(r.quantity),
    unitRate: r.unit_rate == null ? null : Number(r.unit_rate),
    amount: Number(r.amount),
    reconciled: Boolean(r.reconciled),
  };
}

/** The combined position across every open budget, for the dashboard tile. */
function summarizeBudgets(
  budgetRows: Record<string, unknown>[],
  entryRows: Record<string, unknown>[],
): DashboardProps["budget"] {
  if (!budgetRows.length) return null;
  const budgets = budgetRows.map(toBudget);
  const entries = entryRows.map(toEntry);
  const total = totalPosition(budgets.map((b) => positionOf(b, entries)));
  return { ...total, count: budgets.length };
}