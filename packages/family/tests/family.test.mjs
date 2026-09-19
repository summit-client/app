/**
 * The family core, tested directly.
 *
 * apps/client/tests/family.test.mjs already exercises most of this through the
 * portal's re-export, which is what proved the extraction faithful. This covers
 * the package on its own terms, and in particular `defaultView` — the one rule
 * that is new here, and the only selection logic the phone has, since it has no
 * localStorage to remember a choice in.
 */
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(mkdtempSync(join(tmpdir(), "summit-family-")), "m.mjs");
await build({
  entryPoints: [join(ROOT, "src", "index.ts")],
  bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "silent",
});
const F = await import(pathToFileURL(out).href);

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => (ok ? passed++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`));

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    client_id: i + 1,
    client_name: `Child ${String.fromCharCode(90 - i)}`,
    client_status: "active",
    preferred_name: null,
    date_of_birth: "2019-06-30",
    household_id: "h1",
    household_name: "The Riveras",
    permissions: ["view_profile", "view_appointments"],
  }));

const one = F.familyFromRows(rows(1));
const two = F.familyFromRows(rows(2));

check("one child opens on that child", F.defaultView(one).kind === "child");
check("one child opens on the right id", F.defaultView(one).clientId === 1);
check("two children open on family view", F.defaultView(two).kind === "family");
check("no children opens on family view", F.defaultView(F.familyFromRows([])).kind === "family");

check("children are sorted by display name, not by row order",
  two.children[0].name < two.children[1].name,
  `${two.children[0].name} then ${two.children[1].name}`);

check("a held permission reads true", F.can(one.children[0], "view_appointments"));
check("an unheld permission reads false", !F.can(one.children[0], "view_billing"));
check("a null child never holds anything", !F.can(null, "view_profile"));
check("canForAny finds it on any child", F.canForAny(two, "view_appointments"));
check("canForAny is false when nobody holds it", !F.canForAny(two, "pay_invoices"));

check("childById finds a child", F.childById(one, 1)?.clientId === 1);
check("childById on an unknown id is null", F.childById(one, 99) === null);
check("childById on null is null", F.childById(one, null) === null);

/* A date of birth is a calendar date, not an instant. new Date("2019-06-30")
   is UTC midnight and reads back as the 29th anywhere west of UTC, taking a
   year off a child whose birthday is today. */
check("age is computed on the calendar date, the day before a birthday",
  F.ageOf(one.children[0], new Date(2026, 5, 29)) === 6,
  String(F.ageOf(one.children[0], new Date(2026, 5, 29))));
check("age ticks over on the birthday itself",
  F.ageOf(one.children[0], new Date(2026, 5, 30)) === 7,
  String(F.ageOf(one.children[0], new Date(2026, 5, 30))));
check("no date of birth is null, not zero",
  F.ageOf({ ...one.children[0], dateOfBirth: null }) === null);

check("displayName prefers what the family calls them",
  F.displayName({ ...one.children[0], preferredName: "Sammy" }) === "Sammy");
check("a blank preferred name falls back to the legal name",
  F.displayName({ ...one.children[0], preferredName: "  " }) === one.children[0].name);

for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
