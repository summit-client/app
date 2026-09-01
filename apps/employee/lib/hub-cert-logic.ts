/**
 * Onboarding-completion and certificate-earning logic, parameterized.
 *
 * lib/hub.ts's effectiveProgress()/onboardingProgress()/
 * pendingOnboardingCertificates() compute this for the CALLER's own loaded
 * snapshot only: derivedTaskProgress() reads requireSnap().training
 * unconditionally, even when a caller-supplied `progress` array names someone
 * else. That is fine for every existing screen (each one shows only the
 * signed-in employee's own onboarding), but the admin console's clinic-wide
 * queues (lib/hub-backend.ts's listTeamDirectory()/
 * listPendingCertificatesToIssue()) need the same computation run once per
 * OTHER employee, from rows fetched directly rather than the loaded snapshot.
 *
 * This is that computation, taking progress and training explicitly instead
 * of reading global state - a deliberate duplicate of the shape in lib/hub.ts,
 * not a refactor of it, so the single-user path all fourteen other screens
 * depend on stays untouched. Same tradeoff CLAUDE.md documents for
 * apps/scheduler's duplicated mobile-nav CSS: if the onboarding rules in
 * lib/hub.ts change (effectiveProgress(), weekComplete(),
 * isOnboardingComplete(), pendingOnboardingCertificates()), check whether this
 * file needs the same fix.
 */

import { HUB_TASKS, type HubTask } from "./content";
import type { TaskProgress, TaskStatus, TrainingRecord } from "./hub-types";

export const ONBOARDING_CERT_TITLE = "New Team Member Onboarding";
export const ONBOARDING_CERT_COMPETENCY = "MODULE # 00";
export const PHASE1_CERT_TITLE = "Onboarding Phase 1: Week 1";
export const PHASE2_CERT_TITLE = "Onboarding Phase 2: Week 2";

/** Stored progress merged with course-derived status, for one employee's raw
 *  rows - the parameterized twin of lib/hub.ts's effectiveProgress(). */
function effectiveProgressFor(progress: TaskProgress[], training: TrainingRecord[]): TaskProgress[] {
  const byKey = new Map(progress.map((p) => [p.taskKey, p]));
  return HUB_TASKS.map((t) => {
    if (t.courseKey) {
      const rec = training.find((tr) => tr.courseKey === t.courseKey);
      const stored = byKey.get(t.key);
      const status: TaskStatus =
        rec?.status === "COMPLETED" ? "COMPLETED" : rec?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
      return { taskKey: t.key, status, notes: stored?.notes ?? "", applicable: stored?.applicable ?? true, completedAt: rec?.completedAt ?? null };
    }
    return byKey.get(t.key) ?? { taskKey: t.key, status: "NOT_STARTED" as TaskStatus, notes: "", applicable: true, completedAt: null };
  });
}

function requiredApplicable(effective: TaskProgress[], week?: 1 | 2): HubTask[] {
  const byKey = new Map(effective.map((p) => [p.taskKey, p]));
  const required = HUB_TASKS.filter((t) => t.required !== false && (week === undefined || t.week === week));
  return required.filter((t) => {
    const p = byKey.get(t.key);
    return p?.status !== "NOT_APPLICABLE" && p?.applicable !== false;
  });
}

/** Onboarding percent for one employee - same rule as onboardingProgress() in
 *  lib/hub.ts (required + applicable tasks only, course tasks derived). */
export function onboardingPercentFor(progress: TaskProgress[], training: TrainingRecord[]): number {
  const eff = effectiveProgressFor(progress, training);
  const byKey = new Map(eff.map((p) => [p.taskKey, p]));
  const applicable = requiredApplicable(eff);
  const completed = applicable.filter((t) => byKey.get(t.key)?.status === "COMPLETED").length;
  return applicable.length ? Math.round((completed / applicable.length) * 100) : 0;
}

/** How many course-linked tasks this employee has not completed. */
export function trainingDueFor(training: TrainingRecord[]): number {
  const done = new Set(training.filter((t) => t.status === "COMPLETED").map((t) => t.courseKey));
  return HUB_TASKS.filter((t) => t.courseKey && !done.has(t.courseKey)).length;
}

function weekCompleteFor(week: 1 | 2, eff: TaskProgress[]): boolean {
  const byKey = new Map(eff.map((p) => [p.taskKey, p]));
  const applicable = requiredApplicable(eff, week);
  return applicable.length > 0 && applicable.every((t) => byKey.get(t.key)?.status === "COMPLETED");
}

/** Which onboarding certificates one employee has earned but has not been
 *  issued, given their raw progress/training and the titles they already
 *  hold. Parameterized twin of pendingOnboardingCertificates() in lib/hub.ts. */
export function earnedUnissuedCertificatesFor(
  progress: TaskProgress[], training: TrainingRecord[], heldTitles: Set<string>,
): { title: string; competency: string }[] {
  const eff = effectiveProgressFor(progress, training);
  const byKey = new Map(eff.map((p) => [p.taskKey, p]));
  const applicable = requiredApplicable(eff);
  const isComplete = applicable.length > 0 && applicable.every((t) => byKey.get(t.key)?.status === "COMPLETED");

  const earned: { title: string; competency: string }[] = [];
  if (weekCompleteFor(1, eff)) earned.push({ title: PHASE1_CERT_TITLE, competency: "ONBOARDING · PHASE 1" });
  if (weekCompleteFor(2, eff)) earned.push({ title: PHASE2_CERT_TITLE, competency: "ONBOARDING · PHASE 2" });
  if (isComplete) earned.push({ title: ONBOARDING_CERT_TITLE, competency: ONBOARDING_CERT_COMPETENCY });
  return earned.filter((e) => !heldTitles.has(e.title));
}
