/**
 * Moved to `@summit/family` so the phone decides which day counts as "today at
 * the clinic" with the same code — a date filter that disagreed between the two
 * would show a parent a different set of upcoming sessions on each.
 *
 * Re-exported rather than relocated because several pages import from this
 * path. The clinic timezone is still hardcoded to the anchor clinic and still
 * temporary; see the note in the package.
 */
export { clinicTodayDateStr, formatClinicDate, clinicWallTimeToUtc } from "@summit/family";
