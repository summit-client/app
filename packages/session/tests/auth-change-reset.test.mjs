/**
 * Which auth events invalidate the identity and settings caches, and what
 * each app does about them.
 *
 * Both caches are module-level and latched on first read, and for a long time
 * nothing cleared either: refreshIdentity() and refreshSettings() existed and
 * documented themselves as "call after a sign-in, a sign-out, or a role
 * change", and no call site did. This pins the event set and the sign-out
 * asymmetry so that stays fixed.
 *
 * What this does NOT do is exercise the real caches against a real Supabase
 * session - there is no browser or auth server here. It reads the shipped
 * sources and asserts the wiring: which events are acted on, and that no
 * handler re-resolves identity on the way out.
 *
 * Run: node packages/session/tests/auth-change-reset.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const session = read("packages/session/index.ts");
const settings = read("packages/settings/index.ts");

console.log("The event set");
const filter = session.match(/if \(event !== [\s\S]*?\) return;/);
t("subscribeToAuthChanges filters the events", !!filter);
for (const ev of ["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"]) {
  t(`${ev} is acted on`, filter && filter[0].includes(ev));
}
t("TOKEN_REFRESHED is not - same user, would thrash both caches",
  filter && !filter[0].includes("TOKEN_REFRESHED"));
t("INITIAL_SESSION is not - the caches are cold at that point",
  filter && !filter[0].includes("INITIAL_SESSION"));

console.log("The listener cannot become a fifth token refresher");
t("its client disables autoRefreshToken", /autoRefreshToken:\s*false/.test(session));
t("it defers out of the gotrue auth lock before calling back", /setTimeout\(\(\) => onChange\(event\), 0\)/.test(session));
t("preview mode subscribes to nothing", /if \(IS_PREVIEW\) return \(\) => \{\};/.test(session));

console.log("Clear-only exists and does not re-resolve");
const clearIdentity = session.match(/export function clearIdentity\(\)[\s\S]*?\n\}/);
t("clearIdentity is exported", !!clearIdentity);
t("clearIdentity does not call getIdentity", clearIdentity && !clearIdentity[0].includes("getIdentity("));
const clearSettings = settings.match(/export function clearSettings\(\)[\s\S]*?\n\}/);
t("clearSettings is exported", !!clearSettings);
t("clearSettings does not call initSettings", clearSettings && !clearSettings[0].includes("initSettings("));
t("clearSettings also removes the preview localStorage layers",
  clearSettings && clearSettings[0].includes("localStorage.removeItem"));
t("and survives localStorage throwing in a private window",
  clearSettings && /catch\s*\{/.test(clearSettings[0]));

console.log("A rejected identity is not cached forever");
const getIdentity = session.match(/export function getIdentity\(\)[\s\S]*?\n\}/);
t("getIdentity drops a rejected attempt", getIdentity && getIdentity[0].includes("cached = null"));
t("and still rethrows, so the caller sees the failure", getIdentity && getIdentity[0].includes("throw err"));

console.log("Every portal is wired, and none re-resolves on the way out");
const apps = {
  "apps/scheduler/lib/useUser.ts": "onAuthStateChange",
  "apps/data/components/session-provider.tsx": "subscribeToAuthChanges",
  "apps/employee/components/session-provider.tsx": "subscribeToAuthChanges",
  "apps/client/pages/_app.tsx": "subscribeToAuthChanges",
};
for (const [file, hook] of Object.entries(apps)) {
  const src = read(file);
  t(`${file} subscribes`, src.includes(hook));
  t(`${file} clears identity`, src.includes("clearIdentity()"));
  t(`${file} clears settings`, src.includes("clearSettings()"));
  // The sign-out branch must not be the one that re-resolves.
  const signedOut = src.match(/SIGNED_OUT[\s\S]{0,320}/);
  t(`${file} does not refresh identity on sign-out`,
    !signedOut || !/refreshIdentity\(|refreshSession\(|getIdentity\(/.test(signedOut[0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
