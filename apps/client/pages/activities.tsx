import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { ActivityStatusBadge } from "../components/activity-status-badge";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import {
  type Activity,
  type ActivityStatus,
  type GoalsById,
  sortActivitiesForFamily,
  groupActivitiesByGoal,
} from "../lib/activity-display";
import { formatClinicDate } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type PageProps =
  | {
      mode: "activities";
      activities: Activity[];
      goalsById: GoalsById;
      activitiesError: boolean;
      clientName: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

/**
 * Home-program activities - the "between-session homework" a clinician
 * assigns tied to one of this client's goals (or none - see
 * lib/activity-display.ts's UNLINKED_GOAL_LABEL), grouped the same way
 * pages/progress.tsx groups goals by domain, except grouped by goal here.
 * The first page in this app where a family does something rather than
 * only reads - marking their own activity in_progress/completed via
 * pages/api/activities/status.ts.
 */
export default function Activities(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [activities, setActivities] = useState<Activity[]>(
    props.mode === "activities" ? props.activities : []
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const { activitiesError, goalsById, clientName, isAdminViewingAs } = props;

  // A plain call, not useMemo. This sits below the `problem` and `error`
  // early-returns above, so as a hook it ran on the activities branch and not
  // on the other two - React counts hooks per render and throws "Rendered more
  // hooks than during the previous render" the moment a mount changes mode.
  // Grouping a client's home-program activities is trivial next to that.
  const groups = groupActivitiesByGoal(sortActivitiesForFamily(activities), goalsById);

  async function markStatus(activityId: string, status: ActivityStatus) {
    setPendingId(activityId);
    setActionError(null);

    try {
      const response = await fetch("/api/activities/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, status }),
      });

      if (!response.ok) {
        setActionError("Couldn't update that activity. Try refreshing the page.");
        return;
      }

      const { activity } = (await response.json()) as { activity: Activity };
      setActivities((current) =>
        current.map((existing) => (existing.id === activity.id ? activity : existing))
      );
    } catch {
      setActionError("Couldn't update that activity. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Home Program" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Home Program</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Between-session activities {clientName}&apos;s clinical team has assigned, and
              where things stand.
            </p>
          </header>

          {actionError ? (
            <div className={styles.emptyBox} style={{ marginBottom: 16 }}>
              <span className={styles.activityError}>{actionError}</span>
            </div>
          ) : null}

          {activitiesError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s home-program activities. Try refreshing the
              page.
            </div>
          ) : activities.length === 0 ? (
            <div className={styles.emptyBox}>
              No activities assigned yet. They&apos;ll appear here once your clinical team adds
              one.
            </div>
          ) : (
            groups.map(({ key, label, activities: groupActivities }) => (
              <section key={key} className={styles.domainSection} aria-label={label}>
                <h2 className={styles.domainHeading}>{label}</h2>
                <div className={styles.goalList}>
                  {groupActivities.map((activity) => (
                    <article key={activity.id} className={styles.activityCard}>
                      <div className={styles.activityHeader}>
                        <span className={styles.activityTitle}>{activity.title}</span>
                        <ActivityStatusBadge status={activity.status} />
                      </div>

                      {activity.description ? (
                        <p className={styles.activityDescription}>{activity.description}</p>
                      ) : null}

                      <span className={styles.activityMeta}>
                        {activity.status === "completed" && activity.completed_at
                          ? `Completed ${formatClinicDate(activity.completed_at)}`
                          : `Assigned ${formatClinicDate(activity.created_at)}`}
                      </span>

                      {isAdminViewingAs ? null : (
                        <div className={styles.activityActions}>
                          {activity.status === "assigned" ? (
                            <button
                              type="button"
                              className={styles.activityButton}
                              disabled={pendingId === activity.id}
                              onClick={() => markStatus(activity.id, "in_progress")}
                            >
                              {pendingId === activity.id ? "Saving..." : "Mark in progress"}
                            </button>
                          ) : null}
                          {activity.status !== "completed" ? (
                            <button
                              type="button"
                              className={`${styles.activityButton} ${
                                activity.status === "in_progress" ? styles.activityButtonSecondary : ""
                              }`}
                              disabled={pendingId === activity.id}
                              onClick={() => markStatus(activity.id, "completed")}
                            >
                              {pendingId === activity.id ? "Saving..." : "Mark complete"}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))
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
    // pages/appointments.tsx and pages/progress.tsx.
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

  // Migration 0035's RLS (home_program_activities_client_read) scopes this
  // to the signed-in family's own child; the client_id filter here is
  // defense-in-depth, matching the same pattern every other query in this
  // app already uses (see pages/progress.tsx's identical comment on its
  // programs query).
  const { data: activities, error: activitiesError } = await supabase
    .from("home_program_activities")
    .select("id, title, description, status, created_at, completed_at, goal_id")
    .eq("client_id", viewed.clientId)
    .order("created_at", { ascending: false });

  if (activitiesError) {
    console.error("Failed to load home-program activities:", activitiesError.message);
  }

  // A second query rather than a PostgREST embed - see lib/activity-display.ts's
  // GoalsById doc comment for why. RLS (programs_client_read) scopes this the
  // same way; the .in() list only ever contains goal ids this same client's
  // own activities already referenced.
  const goalIds = Array.from(
    new Set((activities ?? []).map((a) => a.goal_id).filter((id): id is string => Boolean(id)))
  );

  const goalsById: GoalsById = {};
  if (goalIds.length > 0) {
    const { data: goals, error: goalsError } = await supabase
      .from("programs")
      .select("id, name, domain")
      .in("id", goalIds);

    if (goalsError) {
      console.error("Failed to load linked goals for activities:", goalsError.message);
    }

    for (const goal of goals ?? []) {
      goalsById[goal.id as string] = { name: goal.name as string, domain: (goal.domain as string) ?? null };
    }
  }

  return {
    props: {
      mode: "activities",
      activities: (activities ?? []) as Activity[],
      goalsById,
      activitiesError: Boolean(activitiesError),
      clientName: viewed.clientName || "Client",
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
