import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The org's configured default session duration in minutes
 * (`@summit/settings`' `org.defaultSessionDuration`, registered default
 * "120") - read directly against `org_settings` rather than through
 * `@summit/settings`'s own `getSetting()`/`resolve()`.
 *
 * That package's public API can't actually run here: `getSetting()` reads
 * an in-memory cache populated by `initSettings()`, which needs
 * `@summit/session`'s `getIdentity()` - and `@summit/session` is `"use
 * client"`, built on `createBrowserClient()` with no way to take a
 * request's cookies. Calling it from a Next.js API route (server-side,
 * no `window`, a separate process from whatever ran in the browser) would
 * not error - it would just silently resolve to each setting's hardcoded
 * default forever, since nothing there would ever populate the live cache
 * in this execution context. That's indistinguishable from having never
 * called it at all, so this queries the same table `@summit/settings`
 * itself resolves the "org" layer from instead.
 *
 * `clinicId` is required and always applied as an explicit filter, not left
 * to `org_settings`' own RLS (`org_settings_read`, migration 0005:
 * `clinic_id = auth_clinic_id()`) to scope alone - the two callers of this
 * function pass different kinds of client. pages/api/calendar.ics.ts's
 * authenticated client gets that RLS check for free, and the explicit
 * filter is defense-in-depth on top of it, matching every other query in
 * this app (see lib/admin-view-as.ts's own header on exactly this point).
 * pages/api/calendar/feed/[token].ics.ts's client is service-role,
 * deliberately bypassing RLS entirely (see
 * lib/calendar-feed-tokens.ts's createFeedLookupClient()) since that
 * route's request carries no session to check RLS against in the first
 * place - for that caller the explicit filter isn't defense-in-depth, it
 * is the *only* thing scoping this query to one clinic at all. Treat
 * `clinicId` as required for both, not just the second one, so this can't
 * quietly regress into an unscoped read if a future caller reuses it with
 * a service-role client and forgets why.
 *
 * Only the org layer is read (never role/user) - `org.defaultSessionDuration`
 * is a scheduling default, not something a client-role account would have a
 * personal override for, and neither caller here has a role/user identity
 * to resolve one against anyway (the feed route has none at all).
 */
export const DEFAULT_SESSION_DURATION_MINUTES = 120;

export async function readDefaultSessionDurationMinutes(
  supabase: SupabaseClient,
  clinicId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("org_settings")
    .select("value")
    .eq("clinic_id", clinicId)
    .eq("key", "org.defaultSessionDuration")
    .maybeSingle();

  if (error) {
    console.error("readDefaultSessionDurationMinutes: lookup failed:", error.message);
    return DEFAULT_SESSION_DURATION_MINUTES;
  }

  // Stored as jsonb - @summit/settings writes select-type values as JSON
  // strings (e.g. "120"), so this comes back as the JS string "120", not
  // the number 120. Number() handles both that and an unset row's
  // `data` being null the same way as an actually-invalid value: fall back
  // rather than exporting NaN-derived garbage into the ICS output.
  const parsed = Number(data?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_DURATION_MINUTES;
}
