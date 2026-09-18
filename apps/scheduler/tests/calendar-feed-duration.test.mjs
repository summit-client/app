/**
 * The staff calendar feed's session-duration lookup, read out of the shipped
 * route rather than restated.
 *
 * This route has no other automated cover - it is an API route, so the
 * calendar suite does not reach it and a build only proves it compiles. What
 * is pinned here is the thing that was silently wrong: the duration for every
 * event in a subscribed calendar was resolved by matching the session's type
 * NAME against session_types. Rename a session type in the admin modal and
 * `.in("name", ...)` missed for every session still carrying the old label -
 * so every one of those events quietly became DEFAULT_DURATION_MINUTES long in
 * the clinician's phone calendar, with nothing anywhere reporting it.
 *
 * Migration 0085 gives a session a pointer at its type; this file asserts the
 * route actually uses it, end to end - selected, carried onto the ICS row, and
 * read by the duration resolver.
 *
 * Run: node apps/scheduler/tests/calendar-feed-duration.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(join(here, "..", "pages", "api", "calendar", "feed", "[token].ics.ts"), "utf8");
const ics = readFileSync(join(here, "..", "lib", "ics.ts"), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

// --- the row shape carries the pointer ------------------------------------
const rowType = route.match(/type SessionRow = \{([\s\S]*?)\n\};/);
t("SessionRow is still declared in the route", !!rowType);
t("SessionRow carries session_type_id", /\bsession_type_id: number \| null;/.test(rowType?.[1] ?? ""));

const sessionSelects = [...route.matchAll(/\.select\("(id, session_date[^"]*)"\)/g)].map((m) => m[1]);
t("both session reads were found", sessionSelects.length === 2, `found ${sessionSelects.length}`);
t("every session read selects session_type_id",
  sessionSelects.length > 0 && sessionSelects.every((s) => s.includes("session_type_id")),
  sessionSelects.join(" | "));

// The standing privacy property of this file, pinned while we are in here:
// a home address is never selected anywhere in it, for any feed kind.
t("no session read selects home_address",
  !sessionSelects.some((s) => s.includes("home_address")) && !/\.select\([^)]*home_address/.test(route));

// --- the duration map is keyed on the id, not the name --------------------
const loader = route.match(/async function loadDurationsByTypeId\([\s\S]*?\n\}/);
t("the duration loader is keyed on the type id", !!loader, "loadDurationsByTypeId not found");
const body = loader?.[0] ?? "";
t("it returns a map keyed by number", /Promise<Map<number, number>>/.test(body));
t("it queries session_types by id", /\.in\("id", typeIds\)/.test(body));
// Comments stripped first: this file's own header explains the name lookup
// it replaced, and an assertion that reads prose rather than code would fail
// on the explanation instead of on the behaviour.
const code = route.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
t("it no longer queries session_types by name", !/\.in\("name"/.test(code));
t("it is still scoped to the caller's clinic", /\.eq\("clinic_id", clinicId\)/.test(body));
t("a row with no pointer is dropped from the lookup rather than guessed at",
  /filter\(\(t\): t is number => t != null\)/.test(body));

// --- the pointer reaches the resolver -------------------------------------
const resolvers = [...route.matchAll(/\(session\) =>([^\n]*DEFAULT_DURATION_MINUTES)/g)].map((m) => m[1]);
t("every feed's duration resolver was found", resolvers.length === 2, `found ${resolvers.length}`);
t("every resolver reads sessionTypeId",
  resolvers.length > 0 && resolvers.every((r) => r.includes("sessionTypeId")), resolvers.join(" | "));
t("no resolver falls back to matching on session.type",
  !resolvers.some((r) => /durationBy\w*\.get\(session\.type\)/.test(r)));

const icsRows = [...route.matchAll(/type: s\.type,\n\s*sessionTypeId: s\.session_type_id,/g)];
t("every ICS row carries the pointer alongside the label", icsRows.length === 3, `found ${icsRows.length}`);

// --- the shared ICS type accepts it ---------------------------------------
t("IcsStaffSession declares sessionTypeId", /sessionTypeId\?: number \| null;/.test(ics));
t("IcsStaffSession still declares type, which is what the SUMMARY renders",
  /\n  type: string \| null;/.test(ics));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
