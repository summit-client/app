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
t("admin managing an hr_admin",
  decide({ callerRole: "admin", targetRole: "hr_admin", deactivate: true }), "ALLOW");

// hr_admin and payroll_admin joined the vocabulary on 2026-09-18. They were
// assignable in the database from migration 0030 and carried a full action
// matrix from 0024, while no code path could hand either to anyone.
console.log("The HR roles are issuable and editable, by admin only");
t("admin may set someone to hr_admin",
  decide({ callerRole: "admin", targetRole: "clinician", setRole: "hr_admin" }), "ALLOW");
t("admin may set someone to payroll_admin",
  decide({ callerRole: "admin", targetRole: "clinician", setRole: "payroll_admin" }), "ALLOW");
t("admin may act on an existing payroll_admin",
  decide({ callerRole: "admin", targetRole: "payroll_admin", setRole: "clinician" }), "ALLOW");
t("a scheduler may NOT set someone to hr_admin",
  decide({ callerRole: "scheduler", targetRole: "clinician", setRole: "hr_admin" }), "DENY");
t("a scheduler may NOT act on an hr_admin at all",
  decide({ callerRole: "scheduler", targetRole: "hr_admin", setRole: "clinician" }), "DENY");
t("a scheduler may NOT deactivate an hr_admin",
  decide({ callerRole: "scheduler", targetRole: "hr_admin", deactivate: true }), "DENY");

// The invite side has its own matrix in a different function, and the Admin
// console keeps a third copy to decide what to offer. All three are read
// here: a role that can be invited but not edited is half a role, and a UI
// offering a role the function rejects is the bug this pair already had.
const is = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

console.log("The invite matrix agrees with the edit matrix and with the UI");
{
  const inviteSrc = readFileSync(join(here, "..", "functions", "invite-teammate", "index.ts"), "utf8");
  const inviteM = inviteSrc.match(/const INVITE_MATRIX[^=]*=\s*(\{[\s\S]*?\n\};)/);
  const INVITE = eval("(" + inviteM[1].replace(/;$/, "") + ")");
  const uiSrc = readFileSync(join(here, "..", "..", "apps", "employee", "app", "admin", "page.tsx"), "utf8");
  const uiM = uiSrc.match(/const INVITE_MATRIX = (\{[\s\S]*?\n\}) as const;/);
  const UI = eval("(" + uiM[1] + ")");

  for (const role of ["hr_admin", "payroll_admin"]) {
    is(`admin may invite a ${role}`, INVITE.admin.includes(role));
    is(`a scheduler may not invite a ${role}`, !INVITE.scheduler.includes(role));
  }
  is("the console offers exactly what invite-teammate accepts, for admin",
    JSON.stringify([...UI.admin].sort()) === JSON.stringify([...INVITE.admin].sort()),
    `ui=${UI.admin} fn=${INVITE.admin}`);
  is("the console offers exactly what invite-teammate accepts, for scheduler",
    JSON.stringify([...UI.scheduler].sort()) === JSON.stringify([...INVITE.scheduler].sort()),
    `ui=${UI.scheduler} fn=${INVITE.scheduler}`);
  is("every role an admin may invite, an admin may also edit into",
    INVITE.admin.every((r) => INTO.admin.includes(r)),
    `invite-only: ${INVITE.admin.filter((r) => !INTO.admin.includes(r))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
