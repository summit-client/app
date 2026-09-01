/** A single home-program activity row as this app selects it (migration
 *  0035's `home_program_activities`) - shared by pages/activities.tsx and
 *  its API route so both read/write one type. */
export type ActivityStatus = "assigned" | "in_progress" | "completed";

export type Activity = {
  id: string;
  title: string;
  description: string | null;
  status: ActivityStatus;
  created_at: string;
  completed_at: string | null;
  goal_id: string | null;
};

/** The subset of a linked `programs` row this page needs to label a group -
 *  keyed by goal id, built server-side in getServerSideProps from a second
 *  query (same "one query, then join client-side" pattern lib/budget.ts's
 *  caller and pages/index.tsx's budget/entries pairing already use) rather
 *  than a PostgREST embed, so a goal this family isn't otherwise permitted
 *  to see (there shouldn't be one, but RLS is the real boundary either way)
 *  can't leak in as embedded JSON on an activity row. */
export type GoalSummary = { name: string; domain: string | null };
export type GoalsById = Record<string, GoalSummary>;

// Actively-assigned work first, then in-progress, then done - the order a
// family checking "what do we still need to do" actually wants, not
// creation order or alphabetical. Mirrors lib/program-display.ts's
// PROGRAM_STATUS_PRIORITY in spirit (family-relevant order, not DB order).
const ACTIVITY_STATUS_PRIORITY: Record<ActivityStatus, number> = {
  assigned: 0,
  in_progress: 1,
  completed: 2,
};

export function sortActivitiesForFamily(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    const priorityA = ACTIVITY_STATUS_PRIORITY[a.status] ?? 0;
    const priorityB = ACTIVITY_STATUS_PRIORITY[b.status] ?? 0;
    return priorityA !== priorityB ? priorityA - priorityB : a.title.localeCompare(b.title);
  });
}

/** Label for an activity with no `goal_id` - a fallback bucket, not a real
 *  goal, so it reads as "not tied to a specific goal" rather than a made-up
 *  goal name. Mirrors lib/program-display.ts's UNSPECIFIED_DOMAIN. */
export const UNLINKED_GOAL_LABEL = "General";

/**
 * Groups an already-sorted activity list by its linked goal, preserving
 * each goal's first-seen order (same reasoning as
 * lib/program-display.ts's groupProgramsByDomain: since the input is
 * sorted by sortActivitiesForFamily, a goal with more currently-assigned
 * activities tends to surface earlier). A missing/unknown goal_id - null,
 * or a goal this family's RLS-scoped query didn't return - falls into the
 * same "General" bucket rather than a group per orphaned id.
 */
export function groupActivitiesByGoal(
  activities: Activity[],
  goalsById: GoalsById
): Array<{ key: string; label: string; activities: Activity[] }> {
  const order: string[] = [];
  const byKey = new Map<string, Activity[]>();

  for (const activity of activities) {
    const goal = activity.goal_id ? goalsById[activity.goal_id] : undefined;
    const key = goal ? activity.goal_id! : "unlinked";
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, []);
    }
    byKey.get(key)!.push(activity);
  }

  return order.map((key) => ({
    key,
    label: key === "unlinked" ? UNLINKED_GOAL_LABEL : goalsById[key].name,
    activities: byKey.get(key)!,
  }));
}
