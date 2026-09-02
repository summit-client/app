/**
 * Goal progress, shaped for both views.
 *
 * The brief is firm that Clinical and Journey must not become two conflicting
 * pictures of the same child, so there is one row type here and both modes
 * render it. Journey does not receive different data, or softer data — it
 * receives the same numbers and chooses to say fewer of them.
 *
 * Everything comes from `client_goal_progress` (migration 0048), which does the
 * arithmetic in SQL. Nothing is recomputed here, so the portal cannot disagree
 * with a clinician looking at the same goal.
 */

export type Trend = "improving" | "steady" | "declining" | "establishing" | "not_enough_data";

export interface GoalProgress {
  programId: string;
  clientId: number;
  goalName: string;
  domain: string | null;
  status: string;
  targetPct: number | null;
  masteryCriteria: string | null;
  /** Written for a parent by a clinician. Null means show nothing. */
  familyRationale: string | null;
  familyHomeStrategy: string | null;
  currentValue: number | null;
  recentAverage: number | null;
  priorAverage: number | null;
  sessionsWithData: number;
  approachingMastery: boolean;
  trend: Trend;
}

export type ProgressMode = "clinical" | "journey";

interface ProgressRow {
  program_id: string;
  client_id: number | string;
  goal_name: string;
  domain: string | null;
  status: string;
  target_pct: number | string | null;
  mastery_criteria: string | null;
  family_rationale: string | null;
  family_home_strategy: string | null;
  current_value: number | string | null;
  recent_average: number | string | null;
  prior_average: number | string | null;
  sessions_with_data: number | string;
  approaching_mastery: boolean;
  trend: string;
}

const num = (v: number | string | null): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export function goalsFromRows(rows: ProgressRow[]): GoalProgress[] {
  return rows.map((r) => ({
    programId: r.program_id,
    clientId: Number(r.client_id),
    goalName: r.goal_name,
    domain: r.domain,
    status: r.status,
    targetPct: num(r.target_pct),
    masteryCriteria: r.mastery_criteria,
    familyRationale: r.family_rationale,
    familyHomeStrategy: r.family_home_strategy,
    currentValue: num(r.current_value),
    recentAverage: num(r.recent_average),
    priorAverage: num(r.prior_average),
    sessionsWithData: Number(r.sessions_with_data ?? 0),
    approachingMastery: Boolean(r.approaching_mastery),
    trend: (r.trend as Trend) ?? "not_enough_data",
  }));
}

/**
 * How a trend reads to a parent.
 *
 * Never a bare arrow. An arrow alone is a direction with no subject, and a
 * parent reading "↓" beside their child's communication goal deserves the
 * sentence rather than the glyph.
 */
export function trendLabel(trend: Trend): string {
  switch (trend) {
    case "improving": return "Improving";
    case "declining": return "Needs attention";
    case "steady": return "Holding steady";
    case "establishing": return "Just started";
    default: return "Not enough data yet";
  }
}

/** Non-colour status, so a trend is never conveyed by hue alone. */
export function trendMark(trend: Trend): string {
  switch (trend) {
    case "improving": return "↑";
    case "declining": return "↓";
    case "steady": return "→";
    default: return "·";
  }
}

/**
 * The Journey view's progress bar, as a percentage of the goal's own target.
 *
 * Capped at 100 rather than allowed past it: a bar reading 118% invites the
 * question "past what?", and the answer is not a clinical statement anybody
 * wants to make from a progress bar.
 *
 * Null when there is not enough data — Journey renders "not started yet"
 * rather than an empty bar that reads as zero progress.
 */
export function journeyPercent(goal: GoalProgress): number | null {
  if (goal.trend === "not_enough_data") return null;
  const value = goal.recentAverage ?? goal.currentValue;
  if (value == null) return null;
  const target = goal.targetPct && goal.targetPct > 0 ? goal.targetPct : 100;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

/** Goals grouped by domain, for the Journey view's per-area summary. */
export function byDomain(goals: GoalProgress[]): { domain: string; goals: GoalProgress[] }[] {
  const map = new Map<string, GoalProgress[]>();
  for (const g of goals) {
    const key = g.domain?.trim() || "Other";
    const list = map.get(key);
    if (list) list.push(g); else map.set(key, [g]);
  }
  return [...map.entries()]
    .map(([domain, gs]) => ({ domain, goals: gs }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * The "At a Glance" figures.
 *
 * Only counts things that are true. `approachingMastery` comes from SQL rather
 * than being guessed here, and there is no fabricated "streak" or "attendance"
 * number: the brief asks for those and this schema cannot support them
 * honestly yet, so they are absent rather than invented.
 */
export interface AtAGlance {
  activeGoals: number;
  masteredGoals: number;
  approachingMastery: number;
  improving: number;
  /** Goals with too little data to say anything about. */
  awaitingData: number;
}

export function atAGlance(goals: GoalProgress[]): AtAGlance {
  return {
    activeGoals: goals.filter((g) => g.status === "active").length,
    masteredGoals: goals.filter((g) => g.status === "mastered").length,
    approachingMastery: goals.filter((g) => g.approachingMastery).length,
    improving: goals.filter((g) => g.trend === "improving").length,
    awaitingData: goals.filter((g) => g.trend === "not_enough_data").length,
  };
}

/**
 * One plain sentence about the month, assembled from counts.
 *
 * Deliberately not model-generated. Every clause is a number this function can
 * see, so there is nothing to hallucinate and nothing that needs a clinician to
 * approve it before a family reads it. When there is nothing to say, it says
 * that instead of reaching.
 */
export function glanceSentence(g: AtAGlance, childName: string): string {
  const parts: string[] = [];
  if (g.improving > 0) {
    parts.push(`${g.improving} goal${g.improving === 1 ? " is" : "s are"} trending upward`);
  }
  if (g.approachingMastery > 0) {
    parts.push(`${g.approachingMastery} ${g.approachingMastery === 1 ? "is" : "are"} approaching mastery`);
  }
  if (g.masteredGoals > 0) {
    parts.push(`${g.masteredGoals} mastered so far`);
  }
  if (parts.length === 0) {
    return g.awaitingData > 0
      ? `Progress will appear here once ${childName} has a few sessions of data.`
      : `No goals are being tracked for ${childName} yet.`;
  }
  const last = parts.pop()!;
  return parts.length
    ? `${parts.join(", ")} and ${last}.`
    : `${last}.`;
}
