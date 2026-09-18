/**
 * edit-teammate's authorization matrix, exercised as a decision table.
 *
 * Edge Functions are deployed separately from the apps and are covered by
 * neither `pnpm turbo build` nor any typecheck script, so the authorization
 * rules in supabase/functions/ have no automated cover at all. This closes
 * that for the one function where getting it wrong is privilege escalation
 * inside a clinic.
 *
 * It reads the matrices out of the function's own source rather than
 * restating them, so a future edit to either matrix shows up here instead of
 * leaving a test that passes against a copy of values nobody changed.
 *
 * Run: node supabase/tests/edit_teammate_authz.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "functions", "edit-teammate", "index.ts"), "utf8");

const grab = (name) => {
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\};)`));
  if (!m) throw new Error(`could not find ${name} in the source`);
  return eval("(" + m[1].replace(/;$/, "") + ")");
};
const INTO = grab("EDIT_INTO_MATRIX");
const TARGETS = grab("EDIT_TARGETS_MATRIX");

// The same sequence of checks the handler runs, in the same order.
function decide({ callerRole, targetRole, setRole, deactivate }) {
  const allowedRoles = INTO[callerRole];
  const editableTargets = TARGETS[callerRole];
  if (!allowedRoles || !editableTargets) return "DENIED: cannot edit teammates";
  if (editableTargets !== "any" && !editableTargets.includes(targetRole)) {
    return `DENIED: cannot change a ${targetRole} account`;
  }
  if (setRole && !allowedRoles.includes(setRole)) return `DENIED: cannot set someone to ${setRole}`;
  if (deactivate) return "ALLOWED: deactivate";
  return "ALLOWED: edit";
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = want === "ALLOW" ? got.startsWith("ALLOWED") : got.startsWith("DENIED");
  if (ok) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "->", got); }
};

console.log("The hole this closes");
t("scheduler demoting their clinic's admin to clinician",
  decide({ callerRole: "scheduler", targetRole: "admin", setRole: "clinician" }), "DENY");
t("scheduler banning their clinic's admin",
  decide({ callerRole: "scheduler", targetRole: "admin", deactivate: true }), "DENY");
t("scheduler banning a supervisor",
  decide({ callerRole: "scheduler", targetRole: "supervisor", deactivate: true }), "DENY");
t("scheduler renaming an admin (no role change at all)",
  decide({ callerRole: "scheduler", targetRole: "admin" }), "DENY");
t("scheduler acting on another scheduler",
  decide({ callerRole: "scheduler", targetRole: "scheduler", setRole: "clinician" }), "DENY");

console.log("What a scheduler may still do");
t("scheduler editing a clinician", decide({ callerRole: "scheduler", targetRole: "clinician", setRole: "clinician" }), "ALLOW");
t("scheduler editing a client", decide({ callerRole: "scheduler", targetRole: "client", setRole: "client" }), "ALLOW");
t("scheduler deactivating a client", decide({ callerRole: "scheduler", targetRole: "client", deactivate: true }), "ALLOW");

console.log("Pre-existing checks still hold");
t("scheduler promoting a clinician to admin", decide({ callerRole: "scheduler", targetRole: "clinician", setRole: "admin" }), "DENY");
t("clinician cannot edit anyone", decide({ callerRole: "clinician", targetRole: "client", setRole: "client" }), "DENY");
t("client cannot edit anyone", decide({ callerRole: "client", targetRole: "client" }), "DENY");

console.log("No regression for admin");
t("admin editing an admin", decide({ callerRole: "admin", targetRole: "admin", setRole: "supervisor" }), "ALLOW");
t("admin deactivating a supervisor", decide({ callerRole: "admin", targetRole: "supervisor", deactivate: true }), "ALLOW");
t("admin managing an hr_admin, outside this file's AppRole union",
  decide({ callerRole: "admin", targetRole: "hr_admin", deactivate: true }), "ALLOW");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
