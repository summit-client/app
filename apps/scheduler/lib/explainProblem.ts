import type { UserProblem } from "./useUser";

/**
 * What to show instead of a blank, RLS-emptied scheduler screen.
 *
 * CLAUDE.md's "Traps that have already bitten": RLS filters queries to
 * nothing rather than refusing outright, so a signed-in user this portal
 * doesn't serve (or one whose profile has no clinic_id) previously saw the
 * full shell with every list empty - indistinguishable from a real "no data
 * yet" state. Mirrors @summit/session's explainProblem() in tone (say what
 * is true and who fixes it) and apps/data's <SessionGate> in shape, but
 * scheduler resolves identity through its own lib/useUser.ts rather than
 * @summit/session, so this stays a local helper instead of a shared one.
 */
export function explainProblem(problem: UserProblem): { title: string; detail: string } {
  switch (problem) {
    case "NO_PROFILE":
      return {
        title: "No usable profile record",
        detail:
          "You are signed in, but there is no row for you in profiles, or its role is not one Summit issues. An administrator needs to fix that before this screen can load.",
      };
    case "NO_CLINIC":
      return {
        title: "Your account is not attached to a clinic",
        detail:
          "Your profile has no clinic on file, so your records are correctly hidden from you. This is not a sign-in problem - contact an administrator to have your account linked to a clinic.",
      };
    case "ROLE_EXCLUDED":
      return {
        title: "Scheduler is not for your role",
        detail:
          "This portal covers admin and scheduler accounts. Your other portals are listed in the bar at the top of the page.",
      };
  }
}
