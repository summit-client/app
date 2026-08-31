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

/**
 * Converts a session's wall-clock time as scheduled at the clinic
 * (`session_date` "YYYY-MM-DD" + `hour`/`minute`, both clinic-local, no
 * timezone of their own) to the correct UTC instant - needed for
 * pages/api/calendar.ics.ts, where a real UTC timestamp is required so a
 * family's calendar app displays the session at the right time in
 * *their* timezone.
 *
 * JS has no built-in "construct a Date from local time in an arbitrary
 * IANA zone" API (that's what the still-unshipped Temporal proposal is
 * for), so this uses the standard guess-and-correct technique: treat the
 * wall-clock numbers as if they were already UTC (`guess`), find out what
 * that guessed instant actually reads as when formatted in the clinic's
 * zone, and correct by the difference. This has to get the DST
 * transitions right (Toronto is UTC-4 roughly March-November, UTC-5
 * otherwise) or every appointment near a transition would be off by an
 * hour in the exported calendar - verified against 8 cases spanning both
 * 2026 DST boundaries and a midnight-crossing evening session before this
 * was wired into anything that ships it.
 */
export function clinicWallTimeToUtc(dateStr: string, hour: number, minute: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);

  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));

  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  // What the guessed instant reads as in the clinic's zone, treated as UTC
  // purely to get a comparable epoch number for the correction below.
  const guessReadAsClinicEpoch = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );

  const correction = guess - guessReadAsClinicEpoch;
  return new Date(guess + correction);
}
