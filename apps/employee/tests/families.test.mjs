/**
 * Clients & Families — the rules, read out of the shipped source.
 *
 * This screen is the only place in the product that can change what a parent
 * sees about their child, and neither it nor lib/hr-backend.ts is covered by
 * anything but lint and a typecheck. The invariants below are the ones where
 * being wrong is either a permissions bug or the RLS-returns-empty trap, so
 * they are asserted against the real files rather than restated.
 *
 * Run: node apps/employee/tests/families.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backend = readFileSync(join(here, "..", "lib", "hr-backend.ts"), "utf8");
const page = readFileSync(join(here, "..", "app", "admin", "page.tsx"), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};
// The body of one function, so an assertion about it cannot be satisfied by a
// line somewhere else in a 1000-line module.
const fnBody = (src, signature) => {
  const at = src.indexOf(signature);
  if (at === -1) return "";
  return src.slice(at, src.indexOf("\n}\n", at));
};

console.log("Reading and writing are two different permissions");
{
  const load = fnBody(backend, "export async function listClientFamilies");
  t("the read takes the caller's reach as an argument",
    /listClientFamilies\(canReadGuardians: boolean\)/.test(backend));
  t("it returns early, before touching guardian_relationships, when the caller cannot read it",
    load.indexOf("if (!canReadGuardians)") < load.indexOf('from("guardian_relationships")'));
  t("the early return still carries the client list",
    /if \(!canReadGuardians\)[\s\S]{0,400}?families: clients\.map/.test(load));
  t("it reports reach as a flag rather than leaving it to a row count",
    load.includes("canSeeGuardians: false") && load.includes("canSeeGuardians: true"));
}

console.log("A refused write is not reported as a save");
{
  const set = fnBody(backend, "export async function setGuardianPermission");
  t("the flip is an update, not an insert", set.includes(".update({") && !set.includes(".insert("));
  t("it asks for the changed row back", set.includes('.select("permission")'));
  t("zero rows changed throws rather than returning quietly",
    /if \(!res\.data\?\.length\)[\s\S]{0,200}?throw new HrWriteError/.test(set));
  t("it filters on both the relationship and the one permission",
    set.includes('.eq("relationship_id"') && set.includes('.eq("permission"'));
  t("it writes no audit row of its own - migration 0068's trigger does that",
    !/from\("clinical_audit_events"\)|log_family_access_event/.test(set));
}

console.log("The screen says what it cannot show");
{
  const tab = fnBody(page, "function FamiliesTab");
  t("an empty guardian list and an unreadable one are different branches",
    tab.includes("!snap.canSeeGuardians"));
  t("the unreadable case explains itself rather than rendering nothing",
    /!snap\.canSeeGuardians[\s\S]{0,600}?not visible to your role/.test(tab));
  t("it re-reads after a flip instead of patching its own copy",
    /await setGuardianPermission\([\s\S]{0,300}?await load\(\)/.test(tab));
}

console.log("Editing is admin-only, viewing is wider");
{
  t("the tab is offered to admin and scheduler only",
    /k === "families" && !\(role === "ADMIN" \|\| appRole === "scheduler"\)/.test(page));
  t("the permission switch is disabled for anyone but an admin",
    /disabled=\{!isAdmin \|\| busy === key\}/.test(page));
  t("a scheduler is given the read, not just the tab",
    /canReadGuardians=\{role === "ADMIN" \|\| identity\.appRole === "scheduler"\}/.test(page));
  t("the read is told the caller's reach, not their admin-ness",
    /listClientFamilies\(canReadGuardians\)/.test(page));
  t("supervisor is still not offered the tab - a clinician, not an administrator",
    !/appRole === "supervisor"|role === "SUPERVISOR"/.test(
      page.slice(page.indexOf('k === "families"'), page.indexOf('k === "families"') + 200)));
  t("a non-admin is told why the control is dead, not left guessing",
    /title=\{isAdmin \? undefined : "Only an administrator can change this"\}/.test(page));
}

// Migration 0084 is what makes the scheduler's read real. The app flag and
// the policy have to agree, and the policy has to be the narrow one.
console.log("Migration 0084 grants the narrow read, not a clinical action");
{
  const mig = readFileSync(join(here, "..", "..", "..", "supabase", "migrations",
    "0084_scheduling_staff_read_guardians.sql"), "utf8");
  for (const table of ["guardian_relationships", "relationship_permissions", "household_members"]) {
    t(`${table} gains a scheduling-staff select`,
      new RegExp(`create policy ${table}_scheduling_read on ${table} for select`).test(mig));
  }
  {
    // Comments name the helper too; measure the statements, not the prose.
    const sql = mig.replace(/^\s*--.*$/gm, "");
    t("it keys on auth_is_scheduling_staff(), which is admin + scheduler",
      (sql.match(/auth_is_scheduling_staff\(\)/g) || []).length === 3,
      String((sql.match(/auth_is_scheduling_staff\(\)/g) || []).length));
  }
  t("it does NOT hand a scheduler clinical.client.read",
    !/grant|insert into public\.role_permissions|clinical\.client\.read'\s*\)/.test(
      mig.replace(/^\s*--.*$/gm, "")));
  t("every new policy is clinic-scoped",
    (mig.replace(/^\s*--.*$/gm, "").match(/auth_clinic_id\(\)/g) || []).length === 3);
  t("it adds no write policy - a scheduler reads and changes nothing",
    !/for (insert|update|delete)/.test(mig.replace(/^\s*--.*$/gm, "")));
  t("it reloads PostgREST's schema cache", mig.includes("notify pgrst"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
