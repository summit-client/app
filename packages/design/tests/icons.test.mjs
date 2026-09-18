/**
 * The shared icon set, checked against its consumers.
 *
 * Two nav tables store their icon as a plain string and cast it with
 * `as IconName` at the render site, which is exactly the shape the compiler
 * cannot check: a typo or a renamed icon becomes an empty 15px box in a
 * sidebar and nothing fails. This reads the real files and closes that gap.
 *
 * Run: node packages/design/tests/icons.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const src = read("packages/design/icons.tsx");
// Comments mention <svg> and colours in prose; strip them so the house-rule
// assertions below measure the code rather than the documentation.
const code = src
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

// The declared union.
const unionBlock = src.slice(src.indexOf("export type IconName ="), src.indexOf(";", src.indexOf("export type IconName =")));
const declared = [...unionBlock.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
// The drawn keys.
const pathsBlock = src.slice(src.indexOf("const PATHS:"), src.indexOf("\n};", src.indexOf("const PATHS:")));
const drawn = [...pathsBlock.matchAll(/^  ([A-Za-z]+):/gm)].map((m) => m[1]);

console.log("The set is internally consistent");
t("the union declares names", declared.length > 0, `got ${declared.length}`);
t("every declared name is drawn", declared.every((n) => drawn.includes(n)),
  `missing: ${declared.filter((n) => !drawn.includes(n)).join(", ")}`);
t("nothing is drawn that is not declared", drawn.every((n) => declared.includes(n)),
  `extra: ${drawn.filter((n) => !declared.includes(n)).join(", ")}`);
t("no duplicate names", new Set(declared).size === declared.length);

console.log("House rules hold");
t("one shared <svg> wrapper, not one per icon", (code.match(/<svg/g) || []).length === 1,
  `found ${(code.match(/<svg/g) || []).length}`);
t("24x24 viewBox", code.includes('viewBox="0 0 24 24"'));
t("currentColor, so icons inherit colour and dark mode", code.includes('stroke="currentColor"'));
t("stroke-only, no fills that would ignore theme", code.includes('fill="none"') && !/fill="(?!none)[^"]+"/.test(code));
t("round caps and joins", code.includes('strokeLinecap="round"') && code.includes('strokeLinejoin="round"'));
t("decorative by default", /aria-hidden/.test(code));

console.log("Every consumer asks for an icon that exists");
// Paths that render an icon by name, with how their nav table spells it.
const consumers = [
  ["apps/scheduler/components/Sidebar.tsx", /icon: "([A-Za-z]+)"/g],
  ["apps/data/components/portal-chrome.tsx", /icon: "([A-Za-z]+)"/g],
  ["apps/employee/app/layout.tsx", /icon: "([A-Za-z]+)"/g],
];
for (const [file, re] of consumers) {
  const used = [...read(file).matchAll(re)].map((m) => m[1]);
  t(`${file} names at least one icon`, used.length > 0, `got ${used.length}`);
  const unknown = used.filter((n) => !declared.includes(n));
  t(`${file} uses only real icon names`, unknown.length === 0, `unknown: ${unknown.join(", ")}`);
}

console.log("The glyphs they replaced are gone");
// The specific collisions this set exists to resolve: one glyph meaning three
// different things across three apps.
for (const [file, glyph] of [
  ["apps/scheduler/components/Sidebar.tsx", "◈"],
  ["apps/data/components/portal-chrome.tsx", "◈"],
  ["apps/employee/app/layout.tsx", "◈"],
]) {
  t(`${file} no longer renders the overloaded diamond`, !read(file).includes(`icon: "${glyph}"`));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
