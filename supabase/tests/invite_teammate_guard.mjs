/**
 * invite-teammate's "this email already has an account" guard.
 *
 * WHAT IT PROTECTS
 *
 * Supabase's inviteUserByEmail resolves an already-registered email to that
 * SAME EXISTING auth.users id. It does not error and it does not mint a new
 * user. The function then upserts profiles for that id - so inviting an
 * existing person writes straight over their role, clinic and supervisor.
 * Confirmed live on 2026-08-30: inviting an admin's own address as
 * "clinician" flipped that admin's own role in place, and their existing
 * training rows then legitimately appeared under the "new" invite, because
 * it was the same account throughout.
 *
 * It is also where the one-login-per-clinic decision is enforced. There is
 * no cross-clinic membership in this schema; a person with an account at
 * another clinic gets a clear error rather than a silent takeover.
 *
 * WHY THIS TEST IS SHAPED THE WAY IT IS
 *
 * The guard's correctness is mostly its POSITION. A database trigger creates
 * a default profiles row (role 'client', clinic_id null) the instant any
 * auth.users row appears - including the one inviteUserByEmail itself
 * creates. So the same query that catches a pre-existing account before the
 * invite would catch this invite's own trigger row after it, and reject
 * every legitimate invite. Running before the call is the entire argument,
 * and it is exactly the kind of thing a later refactor moves without
 * noticing. So these assertions read offsets out of the shipped source.
 *
 * Edge Functions are covered by neither `pnpm turbo build` nor any typecheck
 * script. Nothing else in this repo checks this file.
 *
 * Run: node supabase/tests/invite_teammate_guard.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "..", "functions", "invite-teammate", "index.ts");
const src = readFileSync(path, "utf8");

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  if (ok) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `\n         ${detail}` : ""); }
};

// Comments describe the guard at length; they must not be what satisfies a
// check. Everything below reads code only.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const at = (re) => { const m = code.match(re); return m ? m.index : -1; };

console.log("\ninvite-teammate: the existing-account guard\n");

console.log("It runs, and it runs first");

const lookup = at(/\.from\(\s*["']profiles["']\s*\)[\s\S]{0,200}?\.eq\(\s*["']email["']/);
t("a profiles row is looked up by email", lookup >= 0,
  "no `.from(\"profiles\") ... .eq(\"email\", ...)` in the source at all");

const invite = at(/inviteUserByEmail/);
t("inviteUserByEmail is still called", invite >= 0);

// The one that matters. Reversed, every real invite is rejected by the
// trigger-created row that its own call just produced.
t("the lookup precedes inviteUserByEmail",
  lookup >= 0 && invite >= 0 && lookup < invite,
  "the guard must query before the invite is sent, or it sees the default " +
  "profiles row the invite's own auth.users insert triggers");

console.log("\nIt refuses rather than overwrites");

const rejection = code.slice(lookup >= 0 ? lookup : 0, invite >= 0 ? invite : code.length);
t("a rejection is returned between the lookup and the invite",
  /return\s+json\(\s*409/.test(rejection),
  "found no `return json(409, ...)` between the lookup and inviteUserByEmail");

// Scoped to the `if (existingProfile)` body, not to everything between the
// lookup and the invite. The wider slice also contains the supervisor check,
// which compares clinic_id to caller.clinic_id for its own reasons - so a
// looser match here reported this rule intact after the two messages had
// been collapsed into one. Caught by mutating the source; the narrower
// window is the fix.
const branchStart = at(/if\s*\(\s*existingProfile\s*\)/);
const branch = branchStart >= 0 ? code.slice(branchStart, branchStart + 600) : "";
t("the rejection is reached only when a profile was found", branchStart >= 0,
  "no `if (existingProfile)` branch - the lookup result is not acted on");

t("the rejection distinguishes this clinic from another clinic",
  /clinic_id\s*===\s*caller\.clinic_id/.test(branch) &&
  /another clinic/i.test(branch) && /your clinic/i.test(branch),
  "both cases should be named - 'already in your clinic' reads as a mistake to " +
  "fix, 'under another clinic' is the one-login-per-clinic decision and means " +
  "something different to whoever is holding the screen");

// Failing open here is the whole bug back: a lookup that errors and is
// ignored proceeds to the upsert that overwrites somebody.
t("a failed lookup rejects rather than continuing",
  /existingProfileErr[\s\S]{0,120}?return\s+json\(\s*5\d\d/.test(rejection) ||
  /Err\b[\s\S]{0,120}?return\s+json\(\s*5\d\d/.test(rejection),
  "an error reading profiles must return, not fall through to the invite");

console.log("\nIt looks up what it will write");

// The lookup is an exact match, so a mixed-case address would miss it and
// fail open. Lowercasing has to happen before, not after.
const lower = at(/email\s*=\s*body\.email[\s\S]{0,80}?\.toLowerCase\(\)/);
t("the email is lowercased before the lookup",
  lower >= 0 && lookup >= 0 && lower < lookup,
  "the lookup is an exact match; an address not normalised first slips past it");

t("the guarded email is the one handed to inviteUserByEmail",
  /inviteUserByEmail\(\s*email\b/.test(code),
  "inviting a different string than the one checked defeats the guard");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
