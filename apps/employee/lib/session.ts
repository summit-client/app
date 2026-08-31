"use client";

/**
 * The hub's view of who is signed in.
 *
 * Identity resolution moved to @summit/session, which every portal now shares.
 * What stays here is the part that is only true of this portal: the three-way
 * HubRole its screens switch on, and the preview role switcher.
 *
 * The `Session` shape and the `getSession` / `refreshSession` / `explainProblem`
 * names are unchanged, so no screen had to be touched.
 */

import {
  type AppRole,
  type Identity,
  type SessionProblem,
  IS_PREVIEW,
  PREVIEW_CLINIC_ID,
  PREVIEW_USER_ID,
  explainProblem as explainForPortal,
  gate,
  getIdentity,
  previewRole as sharedPreviewRole,
  refreshIdentity,
  setPreviewRole as sharedSetPreviewRole,
} from "@summit/session";

export { IS_PREVIEW, PREVIEW_CLINIC_ID, PREVIEW_USER_ID };
export type { AppRole, SessionProblem };

/** What the hub's screens actually switch on. */
export type HubRole = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";

export interface Session {
  userId: string;
  clinicId: string | null;
  appRole: AppRole | null;
  role: HubRole;
  fullName: string | null;
  supervisorId: string | null;
  problem: SessionProblem | null;
  isPreview: boolean;
}

/**
 * The roles PORTAL_ACCESS.employee admits, collapsed into this portal's own
 * three-tier ladder. A role outside it is ROLE_EXCLUDED before this map is
 * ever consulted.
 *
 * scheduler maps to EMPLOYEE, the same as clinician - self-service hub
 * screens only (My Onboarding, Training, etc.), never blanket SUPERVISOR
 * power over other people's records. Scheduler's one elevated privilege
 * here - reaching the Admin console - doesn't fit this ladder (it's an
 * orthogonal grant, not "promote to supervisor everywhere in the app"), so
 * it's handled as an explicit exception on the Admin route itself
 * (apps/employee/app/admin/page.tsx) rather than by mapping scheduler to
 * SUPERVISOR here.
 */
const HUB_ROLE: Partial<Record<AppRole, HubRole>> = {
  admin: "ADMIN",
  supervisor: "SUPERVISOR",
  clinician: "EMPLOYEE",
  scheduler: "EMPLOYEE",
};

const APP_ROLE: Record<HubRole, AppRole> = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  EMPLOYEE: "clinician",
};

/** EMPLOYEE is the safe default: it is the least privileged of the three, so a
 *  screen that renders before a problem is handled shows the smallest surface. */
function toSession(identity: Identity): Session {
  return {
    userId: identity.userId,
    clinicId: identity.clinicId,
    appRole: identity.appRole,
    role: (identity.appRole && HUB_ROLE[identity.appRole]) || "EMPLOYEE",
    fullName: identity.fullName,
    supervisorId: identity.supervisorId,
    problem: identity.problem,
    isPreview: identity.isPreview,
  };
}

export function getSession(): Promise<Session> {
  return getIdentity().then((i) => toSession(gate(i, "employee")));
}

/** Drop the cache. Call after a sign-in, a sign-out, or a role change. */
export function refreshSession(): Promise<Session> {
  return refreshIdentity().then((i) => toSession(gate(i, "employee")));
}

export function previewRole(): HubRole {
  return HUB_ROLE[sharedPreviewRole("admin")] ?? "ADMIN";
}

export function setPreviewRole(role: HubRole): void {
  sharedSetPreviewRole(APP_ROLE[role]);
}

export function explainProblem(p: SessionProblem): { title: string; detail: string } {
  return explainForPortal(p, "employee");
}
