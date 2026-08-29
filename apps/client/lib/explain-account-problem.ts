import type { AccountProblem } from "./admin-view-as";

export type { AccountProblem };

/**
 * What to show for each AccountProblem instead of a blank dashboard/
 * appointments list. Mirrors @summit/session's explainProblem() in tone -
 * says what is true and who fixes it, since "empty portal" reads as a
 * sign-in bug and isn't one.
 */
export function explainAccountProblem(problem: AccountProblem): { title: string; detail: string } {
  switch (problem) {
    case "NO_CLINIC":
      return {
        title: "Your account is not attached to a clinic",
        detail:
          "Your profile has no clinic on file, so your records are correctly hidden from you. This is not a sign-in problem - contact your clinic to have your account linked to it.",
      };
    case "NO_CLIENT_LINK":
      return {
        title: "No client record is linked to your account",
        detail:
          "You are signed in, but there is no client record connected to your account yet. Contact your clinic's front desk so they can link it - this is not a sign-in problem.",
      };
  }
}
