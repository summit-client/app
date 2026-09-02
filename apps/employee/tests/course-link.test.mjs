/**
 * lib/content-server.ts — the SHIPPED resolver, not a copy.
 *
 * `resolveCourseLink` takes a key straight off the URL
 * (`/api/course-link/[key]`). It used `COURSE_LINKS[key] ?? null`, and a plain
 * object literal inherits from Object.prototype: "toString", "constructor" and
 * "valueOf" all return a FUNCTION rather than undefined, which `?? null` does
 * not catch. That function reached `NextResponse.redirect()`, where
 * `new URL(fn)` throws — so the route answered an unhandled 500 where it meant
 * to answer 404.
 *
 * Run: node tests/course-link.test.mjs
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

const temps = [];
const out = join("tests", ".tmp-content-server.mjs");
await esbuild.build({
  entryPoints: ["lib/content-server.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
  // content-server.ts reaches @supabase/ssr through its imports, and esbuild cannot resolve it under
  // platform:"neutral". The dependency is not what this suite tests, so it is
  // left unbundled - the same thing every suite here that passes already does.
  external: ["@supabase/ssr"],
});
temps.push(out);
process.on("exit", () => temps.forEach((f) => { try { unlinkSync(f); } catch { /* gone */ } }));

const { resolveCourseLink } = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

console.log("Course link resolution");

const real = resolveCourseLink("cc-whmis");
t("a real course key resolves to a URL",
  typeof real === "string" && real.startsWith("https://"), String(real));

t("an unknown key is null",
  resolveCourseLink("no-such-course") === null, String(resolveCourseLink("no-such-course")));

// The regression this file exists for. Every one of these used to come back as
// a function off the prototype chain.
for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"]) {
  const got = resolveCourseLink(key);
  t(`"${key}" does not leak off the prototype chain`,
    got === null, `got ${typeof got}`);
}

t("an empty key is null", resolveCourseLink("") === null);

// Whatever comes back is always a string or null, so the route can only ever
// hand a string to redirect().
const shapes = ["cc-whmis", "toString", "nope", "", "__proto__"]
  .map(resolveCourseLink)
  .every((v) => v === null || typeof v === "string");
t("every result is a string or null, never anything else", shapes);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
