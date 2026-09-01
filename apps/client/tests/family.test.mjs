/**
 * Family selection logic — the SHIPPED lib/family.ts, not a copy.
 *
 * These functions decide which child a parent is looking at and which parts of
 * the portal they are offered. Getting the recall wrong shows one child's data
 * under another child's name, which is the single worst thing this portal can
 * do.
 *
 * Run: node tests/family.test.mjs
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const roots = ["../../node_modules/.pnpm", "../../../node_modules/.pnpm"];
let esbuildMain = null;
for (const root of roots) {
  if (!existsSync(root)) continue;
  const dir = readdirSync(root).find((d) => d.startsWith("esbuild@"));
  if (!dir) continue;
  const candidate = join(root, dir, "node_modules/esbuild/lib/main.js");
  if (existsSync(candidate)) { esbuildMain = resolve(candidate); break; }
}
if (!esbuildMain) { console.log("SKIP: esbuild not found - run pnpm install at the repo root"); process.exit(0); }
const esbuild = await import(pathToFileURL(esbuildMain).href);

const out = join("tests", ".tmp-family.mjs");
await esbuild.build({
  entryPoints: ["lib/family.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });

// The module reaches for localStorage; give it one that behaves.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const F = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const rows = (n) => [
  { client_id: 7, client_name: "Maya Yankov", client_status: "active", preferred_name: "Maya",
    date_of_birth: "2019-06-30", household_id: "h1", household_name: "Yankov Family",
    permissions: ["view_profile", "view_appointments", "view_clinical_progress", "view_billing"] },
  { client_id: 4, client_name: "Noah Yankov", client_status: "active", preferred_name: null,
    date_of_birth: "2021-02-14", household_id: "h1", household_name: "Yankov Family",
    permissions: ["view_profile", "view_appointments"] },
].slice(0, n);

console.log("Shaping the family");

const family = F.familyFromRows(rows(2));
t("both children arrive", family.children.length === 2);
t("the household comes with them",
  family.householdName === "Yankov Family" && family.householdId === "h1");
t("children sort by display name, not by insertion or id",
  family.children.map((c) => F.displayName(c)).join(",") === "Maya,Noah Yankov",
  family.children.map((c) => F.displayName(c)).join(","));
t("a preferred name wins over the legal name",
  F.displayName(family.children[0]) === "Maya");
t("no preferred name falls back to the legal name",
  F.displayName(family.children[1]) === "Noah Yankov");
t("an empty family is not a crash",
  F.familyFromRows([]).children.length === 0 && F.familyFromRows([]).householdId === null);

console.log("\nAge is a calendar date, not an instant");

// The bug this guards: new Date("2019-06-30") is UTC midnight and reads back as
// the 29th west of UTC, which takes a year off a child on their birthday.
const prevTz = process.env.TZ;
process.env.TZ = "America/Toronto";
const maya = family.children[0];
t("the day before the birthday", F.ageOf(maya, new Date(2026, 5, 29)) === 6,
  String(F.ageOf(maya, new Date(2026, 5, 29))));
t("on the birthday", F.ageOf(maya, new Date(2026, 5, 30)) === 7,
  String(F.ageOf(maya, new Date(2026, 5, 30))));
t("the day after", F.ageOf(maya, new Date(2026, 6, 1)) === 7);
process.env.TZ = "Australia/Sydney";
t("east of UTC gives the same answer", F.ageOf(maya, new Date(2026, 5, 30)) === 7);
process.env.TZ = prevTz;
t("no date of birth is null, not 0 or NaN",
  F.ageOf({ ...maya, dateOfBirth: null }) === null);

console.log("\nPermissions gate what is offered");

t("a held permission is true", F.can(family.children[0], "view_billing"));
t("a permission this child's relationship lacks is false",
  !F.can(family.children[1], "view_billing"));
t("no child selected is false, never a crash", !F.can(null, "view_billing"));
t("canForAny is some, not every — the tab shows if any child qualifies",
  F.canForAny(family, "view_billing"));
t("canForAny is false when no child qualifies",
  !F.canForAny(family, "pay_invoices"));

console.log("\nRemembering who the parent was looking at");

store.clear();
t("two children with nothing stored default to Everyone",
  F.recallView("user-1", family).kind === "family");
t("one child defaults to that child",
  F.recallView("user-1", F.familyFromRows(rows(1))).kind === "child");

F.rememberView("user-1", { kind: "child", clientId: 4 });
const recalled = F.recallView("user-1", family);
t("a remembered child comes back",
  recalled.kind === "child" && recalled.clientId === 4,
  JSON.stringify(recalled));

F.rememberView("user-1", { kind: "family" });
t("Everyone round trips", F.recallView("user-1", family).kind === "family");

// The one that matters most: a stale or tampered value must never select a
// child this parent cannot see.
store.set("summit-family-view:user-1", "999");
t("a remembered child who is not in this family is discarded",
  F.recallView("user-1", family).kind === "family");
store.set("summit-family-view:user-1", "'; drop table clients; --");
t("a junk value is discarded rather than parsed",
  F.recallView("user-1", family).kind === "family");

t("the memory is per user, so a shared computer does not cross parents",
  F.recallView("user-2", family).kind === "family");
F.rememberView("user-2", { kind: "child", clientId: 7 });
const u1 = F.recallView("user-1", family);
const u2 = F.recallView("user-2", family);
t("two parents on one browser keep separate selections",
  u1.kind === "family" && u2.kind === "child" && u2.clientId === 7,
  `${JSON.stringify(u1)} / ${JSON.stringify(u2)}`);

console.log("\nLookup");
t("childById finds a child", F.childById(family, 7)?.clientId === 7);
t("childById on an unknown id is null", F.childById(family, 999) === null);
t("childById on null is null", F.childById(family, null) === null);

console.log("\nThe switcher's choice has to reach the server too");
t("remembering a child writes the cookie the server reads", (() => {
  // Server-rendered pages resolve a child through resolveViewedClient, which
  // cannot see localStorage. Without the cookie a parent who switches children
  // is switched back by the next page they open.
  const jar = [];
  globalThis.document = { set cookie(v) { jar.push(v); }, get cookie() { return jar.join("; "); } };
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  F.rememberView("user-1", { kind: "child", clientId: 42 });
  delete globalThis.document; delete globalThis.localStorage;
  return jar.some((c) => c.startsWith("summit_viewed_child=42") && /samesite=lax/i.test(c));
})());
t("no document (server render or a test) does not throw", (() => {
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  try { F.rememberView("user-1", { kind: "family" }); return true; }
  catch { return false; }
  finally { delete globalThis.localStorage; }
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
