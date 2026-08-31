/**
 * "Today" for this portal's own date filtering (the "Upcoming Sessions"
 * query's cutoff) and its scheduled/completed split - in the clinic's own
 * calendar day, not the server process's timezone.
 *
 * `new Date().toISOString().slice(0, 10)` (what both pages used before)
 * returns the UTC calendar date, not Ontario's. The production server runs
 * in UTC, and Toronto is UTC-4/-5, so for roughly the last 4-5 hours of
 * every Eastern day (after ~8pm EDT / 7pm EST), the UTC date has already
 * rolled over to tomorrow while it's still today locally. Concretely, that
 * made "Upcoming Sessions" (lib/admin-view-as.ts's caller, pages/index.tsx)
 * drop today's own remaining sessions from the list every evening - they'd
 * fail `session_date >= todayDateStr` because `todayDateStr` was already
 * tomorrow's date - and made pages/appointments.tsx's derived
 * scheduled/completed split mark those same still-upcoming sessions
 * "Completed" hours before they actually happened.
 *
 * TEMPORARY (see CLAUDE.md's "clinic_id" hard constraint: clinic-specific
 * values must say so and get parameterized once a real reason exists):
 * hardcoded to the anchor clinic's zone. `@summit/settings` already has the
 * real per-org answer (`org.timezone`, default "America/Toronto") for when
 * a second clinic in a different zone exists, but apps/client doesn't
 * depend on that package today and this pass didn't add a new workspace
 * dependency to fix a date-off-by-one bug - see BLOCKED-client.md.
 */
const CLINIC_TIME_ZONE = "America/Toronto";

/** YYYY-MM-DD for "today" in the clinic's own timezone - the en-CA locale
 *  formats dates this way natively, so no manual zero-padding/reassembly. */
export function clinicTodayDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(new Date());
}

/**
 * Formats a timestamp for display (e.g. "Aug 31, 2026") with a fixed
 * locale and timezone, rather than `toLocaleDateString(undefined, ...)`'s
 * ambient-environment behavior. This app is server-rendered
 * (getServerSideProps) but the same formatting call also runs again in the
 * browser during hydration - `undefined` resolves to the *server's* locale
 * during SSR and the *visitor's device* locale/timezone during hydration,
 * which don't have to agree (a family member overseas, or simply a server
 * container with a different default locale than a browser's language
 * setting) and can each land on a different calendar day near a local
 * midnight, not just a different string format. Pinning both removes the
 * mismatch instead of relying on server and client happening to agree.
 */
export function formatClinicDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
