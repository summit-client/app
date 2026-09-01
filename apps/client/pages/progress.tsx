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
import { atAGlance, byDomain, glanceSentence, goalsFromRows, journeyPercent,
         trendLabel, trendMark, type GoalProgress, type ProgressMode } from "../lib/progress";

type PageProps =
  | {
      mode: "progress";
      programs: Program[];
      programsError: boolean;
      /** The same rows both views read. See migration 0037. */
      goals: GoalProgress[];
      goalsError: boolean;
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

  const { programs, programsError, goals, goalsError, clientName, isAdminViewingAs } = props;

  // Clinical is the default. Journey is the friendlier reading, but a
  // parent arriving at a page called Progress is usually looking for a
  // specific number, and defaulting to the softer view puts an extra click
  // in front of it. The brief allows a clinic to configure this; until
  // there is a setting to read, the honest default is the fuller one.
  const [mode, setMode] = useState<ProgressMode>("clinical");

  const glance = useMemo(() => atAGlance(goals), [goals]);
  const journeyDomains = useMemo(() => byDomain(goals), [goals]);

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

            {/* At a Glance. Assembled from counts rather than generated, so
                there is nothing here a clinician would need to approve and
                nothing that can overstate what the data shows. */}
            {goals.length > 0 ? (
              <p style={{ margin: "14px 0 0", color: "var(--ink)", fontSize: 15, maxWidth: "58ch" }}>
                {glanceSentence(glance, clientName)}
              </p>
            ) : null}

            {/* The toggle. Both views read the same rows; this chooses how much
                of them to say. */}
            {goals.length > 0 ? (
              <div
                role="group"
                aria-label="How to show progress"
                style={{ display: "flex", gap: 6, marginTop: 16 }}
              >
                {(["clinical", "journey"] as ProgressMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    style={{
                      padding: "8px 14px", minHeight: 44, borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${mode === m ? "#0C5350" : "#cddde4"}`,
                      background: mode === m ? "#0C5350" : "#fff",
                      color: mode === m ? "#fff" : "#365468",
                      fontWeight: 600, fontSize: 14,
                    }}
                  >
                    {m === "clinical" ? "Clinical" : "Journey"}
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          {goalsError ? (
            <div className={styles.emptyBox} role="alert">
              Couldn&apos;t load {clientName}&apos;s progress. Try refreshing the page.
            </div>
          ) : null}

          {/* Journey: the same goals, grouped by area, saying less. Rendered
              instead of the clinical list rather than alongside it, because two
              readings of one number on one screen is the confusion the brief
              is trying to avoid. */}
          {mode === "journey" && !goalsError && goals.length > 0 ? (
            <section aria-label={`${clientName}'s journey`} style={{ display: "grid", gap: 18 }}>
              {journeyDomains.map(({ domain, goals: domainGoals }) => (
                <article key={domain} className={styles.card}>
                  <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--ink)" }}>{domain}</h2>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
                    {domainGoals.map((g) => {
                      const pct = journeyPercent(g);
                      return (
                        <li key={g.programId}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            gap: 12, marginBottom: 6, flexWrap: "wrap",
                          }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                              {g.goalName}
                            </span>
                            {/* The trend as words plus a mark. Never a bare
                                arrow, and never colour alone. */}
                            <span style={{ fontSize: 13, color: "var(--muted)" }}>
                              <span aria-hidden="true">{trendMark(g.trend)}</span>{" "}
                              {trendLabel(g.trend)}
                            </span>
                          </div>

                          {pct == null ? (
                            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                              Not enough sessions yet to show a trend.
                            </p>
                          ) : (
                            <div
                              role="img"
                              // The bar is decorative; the number it represents
                              // is said here, so a screen reader gets the value
                              // rather than a shape.
                              aria-label={`${g.goalName}: ${pct}% of target`}
                              style={{
                                height: 8, borderRadius: 999,
                                background: "var(--surface-2, #e4eff1)", overflow: "hidden",
                              }}
                            >
                              <div style={{
                                width: `${pct}%`, height: "100%", borderRadius: 999,
                                background: g.status === "mastered" ? "#1B7A62" : "#0C5350",
                              }} />
                            </div>
                          )}

                          {g.status === "mastered" ? (
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#1B7A62", fontWeight: 600 }}>
                              Mastered
                            </p>
                          ) : g.approachingMastery ? (
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                              Close to mastery
                            </p>
                          ) : null}

                          {/* Only shown when a clinician wrote one. Never
                              derived from the operational definition. */}
                          {g.familyRationale ? (
                            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                              {g.familyRationale}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </section>
          ) : null}

          {mode === "clinical" && programsError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s goals. Try refreshing the page.
            </div>
          ) : mode === "clinical" && programs.length === 0 ? (
            <div className={styles.emptyBox}>
              No goals yet. They&apos;ll appear here once your clinical team adds them.
            </div>
          ) : mode === "clinical" ? (
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
          ) : null}
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

  // Both views read this one function: it applies the per-child clinical
  // permission, so a guardian with appointments but not progress gets nothing
  // rather than an empty-looking page they assume is a bug.
  const { data: goalRows, error: goalsError } = await supabase.rpc("my_goal_progress");
  if (goalsError) {
    console.error("Failed to load goal progress:", goalsError.message);
  }

  if (programsError) {
    console.error("Failed to load progress page programs:", programsError.message);
  }

  return {
    props: {
      mode: "progress",
      programs: sortProgramsForFamily((programs ?? []) as Program[]),
      programsError: Boolean(programsError),
      // Filtered to the child being viewed. my_goal_progress() returns every
      // child this guardian may see, which is right for a family-wide surface
      // and wrong for this page.
      // Number() on both sides: PostgREST returns bigint as a string, and
      // viewed.clientId is typed as one too, so an === between them is a
      // comparison that can never be true.
      goals: goalsFromRows((goalRows ?? []).filter(
        (g: { client_id: number | string }) => Number(g.client_id) === Number(viewed.clientId))),
      goalsError: Boolean(goalsError),
      clientName: viewed.clientName || "Client",
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
