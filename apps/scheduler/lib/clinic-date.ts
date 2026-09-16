/**
 * "Today," and clinic-local wall-clock-to-UTC conversion, for
 * pages/api/calendar/feed/[token].ics.ts - a direct port of
 * apps/client/lib/clinic-date.ts's `clinicTodayDateStr()` and
 * `clinicWallTimeToUtc()`. See that file for the full reasoning on both; the
 * short version is repeated here because this route runs under a different,
 * easy-to-miss constraint than pages/index.jsx's existing exportICS():
 *
 * exportICS() runs entirely in the browser, on a machine presumably sitting
 * in the clinic (or at least in the same wall-clock zone), so
 * `new Date(year, month-1, day, hour, minute)` - local-timezone construction
 * - happens to land on the right instant. This route is a Next.js API route:
 * it runs on the SERVER, whatever timezone that process's container happens
 * to be in (production here is UTC - see apps/client/lib/clinic-date.ts's
 * own header on exactly this off-by-several-hours trap), and it is reached
 * by a calendar app's background poll, not a browser sitting in the clinic.
 * Reusing exportICS()'s local-Date approach here would silently regress to
 * the wrong-timezone bug that file's comments already describe fixing once -
 * just moved from "the exported time is wrong" to "the exported time is
 * wrong AND today's cutoff drops today's remaining sessions after ~8pm
 * Eastern," the same UTC-rollover bug apps/client hit on its own "Upcoming
 * Sessions" query. Using the explicit IANA-zone conversion instead avoids
 * both.
 *
 * TEMPORARY, same as apps/client's copy (see CLAUDE.md's "clinic_id" hard
 * constraint: clinic-specific values must say so and get parameterized once
 * a real reason exists) - hardcoded to the anchor clinic's zone rather than
 * reading `@summit/settings`' `org.timezone`, for the same reason
 * apps/client's version gives: this app doesn't depend on that package
 * today, and this change didn't add a new workspace dependency to fix a
 * date/time bug. If a second clinic in a different zone is onboarded before
 * this is generalized, this needs to become a real per-clinic lookup, not
 * another hardcoded copy.
 */
const CLINIC_TIME_ZONE = "America/Toronto";

/** YYYY-MM-DD for "today" in the clinic's own timezone. */
export function clinicTodayDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(new Date());
}

/**
 * Converts a session's wall-clock time as scheduled at the clinic
 * (`session_date` "YYYY-MM-DD" + `hour`/`minute`, both clinic-local, no
 * timezone of their own) to the correct UTC instant, DST-correct - see
 * apps/client/lib/clinic-date.ts's identical function for the full
 * guess-and-correct technique this uses and how it was verified.
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
