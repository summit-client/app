/**
 * The credential flow in apps/employee, read out of the shipped source rather
 * than restated.
 *
 * None of this has other automated cover: `hr-backend.ts` talks to Supabase and
 * the Admin console is a React screen, so a build only proves they compile.
 * What is pinned here is the set of properties that, if they quietly changed,
 * would put an unchecked registration number back on a client's receipt -
 * which is what migration 0034's receipt view does with a GOOD_STANDING
 * credential, and what 0086 exists to stop.
 *
 * Run: node apps/employee/tests/credentials-console.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backend = readFileSync(join(here, "..", "lib", "hr-backend.ts"), "utf8");
const store = readFileSync(join(here, "..", "lib", "hr-store.ts"), "utf8");
const admin = readFileSync(join(here, "..", "app", "admin", "page.tsx"), "utf8");
const page = readFileSync(join(here, "..", "app", "credentials", "page.tsx"), "utf8");
const types = readFileSync(join(here, "..", "lib", "credentials.ts"), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};
// hr-backend.ts holds TWO implementations of the same interface - the preview
// one backed by localStorage, then the live one backed by Supabase - and the
// preview one comes first in the file. An assertion that just searched for a
// method name would read the wrong implementation and pass on a live backend
// that had changed underneath it. Split first, then search the live half.
const LIVE_AT = backend.indexOf("export function supabaseBackend");
if (LIVE_AT === -1) throw new Error("supabaseBackend is gone - this file's premise has moved");
const live = backend.slice(LIVE_AT);
const preview = backend.slice(0, LIVE_AT);

/** One method's body, from a slice that holds exactly one of them. */
const bodyOf = (src, name) => {
  const start = src.indexOf(name);
  if (start === -1) return "";
  const rest = src.slice(start + name.length);
  let depth = 1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "{") depth++;
    else if (rest[i] === "}") { depth--; if (depth === 0) return rest.slice(0, i); }
  }
  return rest;
};

// --- the employee's own save ----------------------------------------------
const save = bodyOf(live, "async saveCredential(c) {");
t("saveCredential was found in the live backend", save.length > 0);
t("it writes the pointer, not a credential name", /credential_type_id: c\.typeId/.test(save));
t("it sends no `status` - the database decides that", !/\bstatus:/.test(save));
t("it sends no `credential` text - a trigger derives it from the pointer",
  !/\bcredential:\s/.test(save));

// --- the queue ------------------------------------------------------------
const queue = bodyOf(live, "async listPendingCredentials() {");
t("listPendingCredentials was found", queue.length > 0);
t("it does NOT filter on the caller's own user_id - that was the pending-sign-offs bug",
  !/\.eq\("user_id"/.test(queue));
t("it is clinic-scoped", /\.eq\("clinic_id", clinic\)/.test(queue));
t("it asks only for what is not yet confirmed", /\.neq\("status", "GOOD_STANDING"\)/.test(queue));

const storeQueue = bodyOf(store, "export async function listPendingCredentials(): Promise<PendingCredential[]> {");
t("the store reads the queue from the backend, never from hr()'s own snapshot",
  /be\(\)\.listPendingCredentials\(\)/.test(storeQueue) && !/\bhr\(\)/.test(storeQueue));

// --- the verification -----------------------------------------------------
const verify = bodyOf(live, "async verifyCredential(id) {");
t("verifyCredential was found", verify.length > 0);
t("it sets GOOD_STANDING and nothing else", /\.update\(\{ status: "GOOD_STANDING" \}\)/.test(verify));
t("it never writes verified_by itself - the database stamps that",
  !/verified_by/.test(verify));
t("it asks for the changed row back", /\.select\("id"\)/.test(verify));
t("it throws when no row came back, because an RLS refusal raises nothing",
  /if \(!res\.data\?\.length\)[\s\S]{0,160}throw new Error/.test(verify));

// --- who is offered the button --------------------------------------------
const canVerify = admin.match(/canVerify=\{([^}]*)\}/);
t("the console computes who may confirm", !!canVerify);
const expr = canVerify?.[1] ?? "";
t("admin, supervisor and hr_admin are offered it",
  /ADMIN/.test(expr) && /supervisor/.test(expr) && /hr_admin/.test(expr), expr);
t("a scheduler is NOT - 0086 denies them the action, so the button would refuse them",
  !/scheduler/.test(expr), expr);

// --- the employee's own screen --------------------------------------------
// Not brace-matched: this signature destructures, so the first brace belongs
// to the parameter list. Sliced between this function and the next instead.
const FORM_AT = page.indexOf("function CredentialForm({");
const form = FORM_AT === -1 ? "" : page.slice(FORM_AT, page.indexOf("\nfunction ", FORM_AT + 10));
t("CredentialForm was found", form.length > 0);
t("it offers no standing control - that was the self-attestation",
  !/cr-status/.test(form) && !/GOOD_STANDING"\}?\s*>/.test(form));
t("its credential picker is driven by the clinic's catalogue, not a hardcoded list",
  /offered\.map\(\(t\) =>/.test(form));
t("no hardcoded KINDS array survives in this screen", !/const KINDS\b/.test(page));
t("a new credential starts PENDING", /status: "PENDING"/.test(page));

// --- the type ------------------------------------------------------------
t("EmployeeCredential carries the verifier", /verifiedBy: string \| null;/.test(types));
t("CredentialType exists", /export interface CredentialType \{/.test(types));

// --- the preview backend models the rule rather than skipping it ----------
t("preview mode refuses self-verification, the same as the database does",
  /cannot be verified by the person it belongs to/.test(preview));
t("preview mode has a catalogue, so the picker is not empty behind nothing",
  /PREVIEW_CREDENTIAL_TYPES/.test(preview));

// --- retiring is never deleting -------------------------------------------
const retire = bodyOf(live, "async retireCredentialType(id, isActive) {");
t("retireCredentialType was found", retire.length > 0);
t("it flags the row rather than deleting it - an existing credential still points at it",
  /\.update\(\{ is_active: isActive \}\)/.test(retire) && !/\.delete\(/.test(retire));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
