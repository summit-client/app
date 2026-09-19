/**
 * The phone's palette is the web's palette.
 *
 * Not "looks similar" — the same source resolved twice. This compares the
 * theme React Native builds against the CSS the browser is served, token by
 * token, so a colour that drifts on one side fails here.
 */
import { build } from "esbuild";
import { readFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const REPO = join(APP, "..", "..");

const out = join(mkdtempSync(join(tmpdir(), "summit-theme-")), "theme.mjs");
await build({
  entryPoints: [join(APP, "src", "lib", "theme.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
});
const { buildTheme } = await import(pathToFileURL(out).href);

let passed = 0;
const failures = [];
const check = (name, got, want) => {
  if (got === want) passed++;
  else failures.push(`${name}\n    got:  ${got}\n    want: ${want}`);
};

/* ── The web side, read out of the generated stylesheet ─────────────────── */
const css = readFileSync(join(REPO, "packages", "design", "tokens.css"), "utf8");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}\n"));
const cssDecls = new Map();
for (const m of rootBlock.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) {
  cssDecls.set(m[1], m[2].trim());
}

const theme = buildTheme("blue", "light");
const camel = (n) => n.replace(/^--/, "").replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/* 1. Every hex the stylesheet states literally must arrive unchanged. */
let hexChecked = 0;
for (const [name, value] of cssDecls) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) continue;
  hexChecked++;
  check(`${name} (literal hex)`, theme.colors[camel(name)], value.toLowerCase());
}
if (hexChecked < 6) failures.push(`only ${hexChecked} literal hex tokens found — did tokens.css change shape?`);

/* 2. Every oklch() colour in the stylesheet must exist on the phone. A silent
      drop is the failure this catches: the theme would simply not have it. */
let colourCount = 0;
for (const [name, value] of cssDecls) {
  if (!value.startsWith("oklch(")) continue;
  colourCount++;
  const got = theme.colors[camel(name)];
  if (typeof got === "string" && /^#[0-9a-f]{6,8}$/i.test(got)) passed++;
  else failures.push(`${name} is oklch() in CSS but ${got === undefined ? "missing" : `"${got}"`} on the phone`);
}
if (colourCount < 30) failures.push(`only ${colourCount} oklch tokens found — did tokens.css change shape?`);

/* 3. The three logo tones are the one independent ground truth in the repo:
      packages/settings stores their hex, written from a browser, and the
      stylesheet states them in OKLCH. Both must land on the same colour. */
const settings = readFileSync(join(REPO, "packages", "settings", "index.ts"), "utf8");
for (const n of [1, 2, 3]) {
  const m = new RegExp(`key: "appearance.logo${n}"[^}]*?default: "(#[0-9a-f]{6})"`, "i").exec(settings);
  if (!m) { failures.push(`appearance.logo${n} default not found in packages/settings`); continue; }
  check(`--logo-${n} vs appearance.logo${n} default`, theme.colors[`logo${n}`], m[1].toLowerCase());
}

/* 4. Alias resolution: --faint is var(--muted) and must not arrive as a string. */
check("--faint resolves through var(--muted)", theme.colors.faint, theme.colors.muted);
check("--color-text-primary resolves through var(--ink)", theme.colors.colorTextPrimary, theme.colors.ink);
check("--shadow-card is dropped, not carried as CSS", theme.colors.shadowCard, undefined);

/* 5. Dark is a different palette, and dark accents are the lightened set. */
const dark = buildTheme("blue", "dark");
check("dark --accent", dark.colors.accent, "#5fb0c4");
if (dark.colors.surface !== theme.colors.surface) passed++;
else failures.push("dark --surface equals light --surface — the dark overrides did not apply");

/* 6. Sizes come across as numbers in points. */
check("--space-4 is 16", theme.size.space4, 16);
check("--radius-md is 10", theme.size.radiusMd, 10);
check("--text-base is 15 (0.9375rem at a 16px root)", theme.size.textBase, 15);
check("--sidebar-w is 244", theme.size.sidebarW, 244);

/* 7. The two brand values Expo reads at build time are generated from the same
      palette, so they cannot quietly become a different blue. */
const appJson = JSON.parse(readFileSync(join(APP, "app.json"), "utf8"));
const splash = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen");
check("app.json splash backgroundColor", splash?.[1]?.backgroundColor, theme.colors.accent);

/* 8. And nothing in the app states a colour of its own. This is the rule
      CLAUDE.md sets for the whole mobile/web boundary - a hex literal in a
      screen is a second source of truth - so it is checked rather than
      trusted. */
const { readdirSync, statSync } = await import("node:fs");
const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(f);
  }
  return acc;
};
const offenders = [];
for (const file of walk(join(APP, "src"))) {
  const body = readFileSync(file, "utf8");
  for (const m of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    // tokens.ts-style comments quoting a hex are prose, not style.
    const line = body.slice(body.lastIndexOf("\n", m.index) + 1, body.indexOf("\n", m.index));
    if (/^\s*(\*|\/\/)/.test(line)) continue;
    offenders.push(`${file.slice(APP.length + 1)}: ${line.trim()}`);
  }
}
if (offenders.length === 0) passed++;
else for (const o of offenders) failures.push(`a hex literal in app source — use the theme\n    ${o}`);

for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
