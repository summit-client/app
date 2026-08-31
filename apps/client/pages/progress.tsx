import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { ProgramStatusBadge } from "../components/program-status-badge";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import {
  type Program,
  sortProgramsForFamily,
  groupProgramsByDomain,
  PROGRAM_STATUS_ORDER,
} from "../lib/program-display";
import { formatStatus } from "../lib/format-status";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type PageProps =
  | {
      mode: "progress";
      programs: Program[];
      programsError: boolean;
      clientName: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

/**
 * Full goal/program history - the dashboard's "Progress Snapshot" card only
 * ever shows every goal with no cap (unlike sessions/updates, programs was
 * never paginated), but had no way to filter or organize a long list, and
 * no dedicated URL of its own to link to. This is that page: grouped by
 * domain (the same three-domain data model design-b.module.css's dead code
 * once referenced - "Three domains, three of the shared data accents" -
 * except domains here come from whatever the data actually contains, never
 * a hardcoded list), filterable by status.
 */
export default function Progress(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [statusFilter, setStatusFilter] = useState<string>("All");

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { programs, programsError, clientName, isAdminViewingAs } = props;

  // Only offer a filter tab for a status this client actually has at least
  // one goal in - not the full universe of possible statuses, and ordered
  // the same family-relevant way sortProgramsForFamily prioritizes them
  // rather than the DB's own row order.
  const availableStatuses = useMemo(() => {
    const present = new Set(programs.map((program) => program.status));
    return PROGRAM_STATUS_ORDER.filter((status) => present.has(status));
  }, [programs]);

  const filteredPrograms =
    statusFilter === "All" ? programs : programs.filter((program) => program.status === statusFilter);

  const domainGroups = useMemo(() => groupProgramsByDomain(filteredPrograms), [filteredPrograms]);

  return (
    <>
      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Progress" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Progress</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {clientName}&apos;s goals across every domain.
            </p>
          </header>

          {programsError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s goals. Try refreshing the page.
            </div>
          ) : programs.length === 0 ? (
            <div className={styles.emptyBox}>
              No goals yet. They&apos;ll appear here once your clinical team adds them.
            </div>
          ) : (
            <>
              <div className={styles.filters} role="group" aria-label="Filter goals by status">
                <button
                  type="button"
                  onClick={() => setStatusFilter("All")}
                  aria-pressed={statusFilter === "All"}
                  className={`${styles.filterButton} ${
                    statusFilter === "All" ? styles.filterButtonActive : ""
                  }`}
                >
                  All
                </button>
                {availableStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    aria-pressed={statusFilter === status}
                    className={`${styles.filterButton} ${
                      statusFilter === status ? styles.filterButtonActive : ""
                    }`}
                  >
                    {formatStatus(status)}
                  </button>
                ))}
              </div>

              {domainGroups.length === 0 ? (
                // Distinct from the "No goals yet" case above: this client
                // has goals, just none matching the current filter - a
                // family clearing a filter shouldn't wonder if their
                // child's whole goal list vanished.
                <div className={styles.emptyBox}>No goals match this filter.</div>
              ) : (
                domainGroups.map(({ domain, programs: domainPrograms }) => (
                  <section key={domain} className={styles.domainSection} aria-label={domain}>
                    <h2 className={styles.domainHeading}>{domain}</h2>
                    <div className={styles.goalList}>
                      {domainPrograms.map((program) => (
                        <article key={program.id} className={styles.goalCard}>
                          <span className={styles.goalName}>{program.name}</span>
                          <ProgramStatusBadge status={program.status} />
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
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
    // The picker lives on the landing page, not here - same as
    // pages/appointments.tsx.
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

  // Same table, columns and clinic_id-derived scoping as the dashboard's
  // Progress Snapshot query (pages/index.tsx) - migration 0020's RLS
  // (programs_client_read) is the real boundary, this client_id filter is
  // defense-in-depth on top of it, not the only thing enforcing it. No
  // .limit() here, unlike the dashboard - the whole point of this page is
  // every goal, not a preview.
  const { data: programs, error: programsError } = await supabase
    .from("programs")
    .select("id, name, domain, status")
    .eq("client_id", viewed.clientId)
    .order("name", { ascending: true });

  if (programsError) {
    console.error("Failed to load progress page programs:", programsError.message);
  }

  return {
    props: {
      mode: "progress",
      programs: sortProgramsForFamily((programs ?? []) as Program[]),
      programsError: Boolean(programsError),
      clientName: viewed.clientName || "Client",
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
