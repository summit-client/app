/**
 * @summit/portals — the portal registry.
 *
 * What Summit's portals are, where they live, and which roles may use each.
 * Pure data: no React, no Supabase, no browser APIs, so a server-side redirect
 * can import it as cheaply as the nav bar can.
 *
 * It exists because this was previously spread across three files that each
 * knew part of it and could drift from the others:
 *
 *   packages/nav/src/portals.config.ts   keys, labels, URLs (hardcoded)
 *   apps/web/lib/role-redirects.ts       URLs again (env-overridable), and
 *                                        where each role lands after sign-in
 *   auth_is_staff() / HUB_ROLE           who may actually read anything
 *
 * They disagreed. The nav bar advertised URLs the sign-in redirect could be
 * configured away from, and the role sets did not match the database's.
 *
 * Consumers: @summit/nav renders the bar from it, @summit/session gates on it,
 * apps/web redirects with it, and every portal's proxy.ts (2026-08-28) reads
 * its own PUBLIC_ORIGIN/LOGIN_URL/REFRESH_URL from it instead of the fourth
 * independent copy of the same values each one used to hardcode.
 *
 * Phase 2 note: per-tenant portal visibility — a clinic that has not bought the
 * employee portal — belongs in org settings, not here. When that lands, ACCESS
 * below becomes the default a per-org row overrides, which is a substitution
 * rather than a refactor. That is why this is its own package and not folded
 * into whichever consumer happened to need it first.
 */

export type PortalKey = "scheduler" | "clinician" | "employee" | "client";

/**
 * `profiles.role` — the app permission, as migration 0001 defines it on the
 * column and as auth_role() / auth_is_staff() read it.
 *
 * NOT `staff.role`, which is the clinical credential (BCBA / BCaBA / RBT /
 * Supervisor) written by the scheduler's admin page. Two different columns with
 * the same name; never conflate them.
 */
export type AppRole = "admin" | "supervisor" | "clinician" | "scheduler" | "client";

export const APP_ROLES: readonly AppRole[] = [
  "admin", "supervisor", "clinician", "scheduler", "client",
] as const;

export function isAppRole(v: unknown): v is AppRole {
  return typeof v === "string" && (APP_ROLES as readonly string[]).includes(v);
}

/**
 * Dev ports match each app's `dev` script in apps/<app>/package.json, which in
 * turn matches the nginx proxy_pass port for that subdomain. All three are
 * pinned explicitly so they cannot drift apart.
 */
const DEV_PORT: Record<PortalKey, number> = {
  scheduler: 3000,
  clinician: 3002,
  client: 3003,
  employee: 3004,
};

const PROD_HOST: Record<PortalKey, string> = {
  scheduler: "https://scheduler.summitclient.io",
  clinician: "https://data.summitclient.io",
  employee: "https://employee.summitclient.io",
  client: "https://client.summitclient.io",
};

/**
 * Per-portal environment override. Next inlines `process.env.NEXT_PUBLIC_*` at
 * build time, so these must be written out rather than indexed dynamically —
 * `process.env[\`NEXT_PUBLIC_URL_${key}\`]` compiles to undefined in the
 * browser bundle.
 */
function override(key: PortalKey): string | undefined {
  switch (key) {
    case "scheduler": return process.env.NEXT_PUBLIC_URL_SCHEDULER;
    case "clinician": return process.env.NEXT_PUBLIC_URL_DATA;
    case "employee": return process.env.NEXT_PUBLIC_URL_EMPLOYEE;
    case "client": return process.env.NEXT_PUBLIC_URL_CLIENT;
  }
}

const isDev =
  typeof process !== "undefined" && process.env?.NODE_ENV === "development";

/** An explicit override wins everywhere; otherwise localhost in dev, the real
 *  host in production. No dead links locally, no localhost in prod. */
export function urlFor(key: PortalKey): string {
  return override(key) ?? (isDev ? `http://localhost:${DEV_PORT[key]}` : PROD_HOST[key]);
}

/**
 * apps/web's own origin - not a PortalKey, since it's the sign-in hub every
 * portal bounces to rather than one of the four a signed-in user moves
 * between. Every portal's proxy.ts needs it (login redirect, and the token
 * refresh endpoint that only ever lives at apps/web - see
 * @summit/proxy-auth's file header for why no portal is allowed to redeem a
 * refresh token itself) and used to hardcode it independently, four times,
 * with no shared override.
 */
function webOverride(): string | undefined {
  return process.env.NEXT_PUBLIC_URL_WEB;
}
export function webUrl(): string {
  return webOverride() ?? (isDev ? "http://localhost:3001" : "https://summitclient.io");
}
export function loginUrl(): string {
  return `${webUrl()}/login`;
}
export function refreshUrl(): string {
  return `${webUrl()}/api/auth/refresh`;
}

/**
 * The one place allowed to end a session, for the same reason refreshUrl()
 * is the one place allowed to redeem a refresh token: every portal's browser
 * Supabase client is built with createBrowserClient() and no cookie
 * overrides, so its default cookie writer clears a cookie scoped to the
 * *current* host only. The actual shared session cookie was written with an
 * explicit `Domain=.summitclient.io` (apps/web/lib/supabase.ts, the only
 * client-side writer configured that way), and a browser will not remove a
 * cookie via a delete that doesn't repeat that same Domain - so a portal
 * calling `supabase.auth.signOut()` on its own client looks like it worked
 * locally (that tab's in-memory state clears, the redirect to /login fires)
 * while leaving the real cross-portal cookie valid, ready to sign the same
 * browser straight back in the moment it visits another portal or reloads.
 * Routing every sign-out through apps/web's own domain-scoped server client
 * (apps/web/lib/supabase-server.ts) is what actually clears it once, for
 * every portal at once, matching the refresh endpoint's precedent exactly.
 */
export function signOutUrl(): string {
  return `${webUrl()}/api/auth/signout`;
}

/**
 * Who may use which portal.
 *
 * `clinician` mirrors auth_is_staff() deliberately: it reads clinic data
 * under policies that call it, so admitting a role here that the function
 * rejects produces a portal that renders and then shows nothing.
 *
 * `employee` does NOT mirror auth_is_staff() - it deliberately admits
 * scheduler too (2026-08-31, for the Admin console link), same call
 * auth_is_scheduling_staff() (migration 0013) already made for the
 * scheduling tables: scheduler is its own staff category here, not folded
 * into the clinical admin/supervisor/clinician one. hub_can_manage()
 * (migration 0022) was widened to match, so this doesn't produce that same
 * renders-then-empty portal the comment above warns about.
 */
const ACCESS: Record<PortalKey, readonly AppRole[]> = {
  scheduler: ["admin", "scheduler"],
  clinician: ["admin", "supervisor", "clinician"],
  employee: ["admin", "supervisor", "clinician", "scheduler"],
  // "admin" added 2026-08-28 so admins can reach the family portal from the
  // nav bar for QA. Note this only makes the link visible - apps/client's
  // own data fetch (pages/index.tsx) looks up `clients` by `user_id =
  // auth.uid()`, which no admin account has a row for, so an admin visiting
  // sees "Family"/"Client" placeholders and, per the sessions table's
  // staff-read RLS policy (clinic_id = auth_clinic_id() and
  // auth_is_staff()), every session in the clinic rather than one family's -
  // not a security issue (admins already have clinic-wide read access), but
  // it is not a preview of what a real family account sees.
  client: ["client", "admin"],
};

export interface Portal {
  key: PortalKey;
  label: string;
  /** Resolved for the current environment. */
  url: string;
  roles: readonly AppRole[];
}

const LABEL: Record<PortalKey, string> = {
  scheduler: "Scheduler",
  clinician: "Clinician Portal",
  employee: "Employee Portal",
  client: "Client Portal",
};

export const PORTAL_KEYS: readonly PortalKey[] = [
  "scheduler", "clinician", "employee", "client",
] as const;

/** Every portal, in display order. URLs resolve when this module loads. */
export const PORTALS: readonly Portal[] = PORTAL_KEYS.map((key) => ({
  key,
  label: LABEL[key],
  url: urlFor(key),
  roles: ACCESS[key],
}));

export function portal(key: PortalKey): Portal {
  return PORTALS.find((p) => p.key === key)!;
}

export function admits(key: PortalKey, role: AppRole | null | undefined): boolean {
  return role != null && ACCESS[key].includes(role);
}

/**
 * Whether a URL's origin is one of our own portals, resolved for the current
 * environment (dev localhost ports or prod hosts, same as PORTALS above).
 * For validating a redirect target supplied by the caller (e.g. a
 * `return_to` query param) before ever redirecting to it - an endpoint that
 * redirects to caller-supplied input unchecked is an open redirect.
 */
export function isKnownOrigin(url: string): boolean {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  return PORTALS.some((p) => {
    try {
      return new URL(p.url).origin === origin;
    } catch {
      return false;
    }
  });
}

/** The portals a role may use, in display order. Drives the portal bar. */
export function portalsFor(role: AppRole | null | undefined): readonly Portal[] {
  return PORTALS.filter((p) => admits(p.key, role));
}

/**
 * Where a role lands after sign-in.
 *
 * Clinical roles land in the clinician portal because that is their daily work
 * — caseload, review queue, supervision. MySummitHR is where they go for
 * onboarding, training and time off, which is a visit rather than a home, so it
 * is reached from the portal bar rather than being anyone's landing page.
 */
const HOME: Record<AppRole, PortalKey> = {
  admin: "scheduler",
  scheduler: "scheduler",
  supervisor: "clinician",
  clinician: "clinician",
  client: "client",
};

export function homePortal(role: AppRole | null | undefined): PortalKey {
  return (role && HOME[role]) || "scheduler";
}

export function homeUrlFor(role: string | null | undefined): string {
  return urlFor(homePortal(isAppRole(role) ? role : null));
}
