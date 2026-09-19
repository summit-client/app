/**
 * The palette clears WCAG AA, measured rather than asserted.
 *
 * CLAUDE.md says "the whole palette clears AA, and it should stay that way".
 * That was true because four accents were each measured by hand. Once a tenant
 * can turn the hue dial, hand-measuring stops scaling — contrast is computed
 * from sRGB luminance, so rotating hue at constant OKLCH lightness moves the
 * ratios. This runs the measurement instead.
 */
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const bundled = async (entry) => {
  const out = join(mkdtempSync(join(tmpdir(), "summit-design-")), "m.mjs");
  await build({ entryPoints: [join(ROOT, "src", entry)], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
};

const { ACCENTS, LIGHT, DARK, isColour, accentDecls } = await bundled("tokens.ts");
const { oklchToRgb, contrastRatio } = await bundled("oklch.ts");

const rgb = (colour, hue, hueDeep) => {
  const h = colour.h === "hue" ? hue : colour.h === "hue-deep" ? hueDeep : colour.h;
  return oklchToRgb(colour.l / 100, colour.c, h);
};

const fromHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Every colour token, flattened by name, for one accent and theme. */
function palette(accentName, theme) {
  const { hue, hueDeep } = ACCENTS[accentName];
  const base = LIGHT.flatMap((g) => g.decls);
  const accentLight = accentDecls(ACCENTS[accentName].light);
  const decls =
    theme === "light"
      ? [...base, ...accentLight]
      : [...base, ...accentLight, ...DARK, ...accentDecls(ACCENTS[accentName].dark)];
  const out = new Map();
  for (const d of decls) {
    if (isColour(d.value)) out.set(d.name, rgb(d.value, hue, hueDeep));
    else if (/^#[0-9a-f]{6}$/i.test(d.value.raw)) out.set(d.name, fromHex(d.value.raw));
  }
  return out;
}

/** [foreground, background, minimum ratio, why]. */
const COMMON = [
  ["--ink", "--surface", 4.5, "body text on a card"],
  ["--ink", "--bg", 4.5, "body text on the page ground"],
  ["--muted", "--surface", 4.5, "secondary text, and --faint resolves to it"],
  ["--muted", "--bg", 4.5, "secondary text on the page ground"],
  ["--accent", "--surface", 4.5, "links and accent text"],
  ["--accent-ink", "--accent", 4.5, "label on a primary button"],
  // A button's label against its OWN background. .btn.danger hardcoded #fff
  // and measured 2.86:1 in dark, and nothing here caught it because every
  // pair was a token against a surface - never a label against the thing it
  // sits on.
  ["--danger-ink", "--danger", 4.5, "label on a destructive button"],
  ["--good", "--surface", 4.5, "status text"],
  ["--warn", "--surface", 4.5, "status text"],
  ["--danger", "--surface", 4.5, "status text"],
  ["--info", "--surface", 4.5, "status text"],
  ["--stat-1", "--surface", 3, "large tile numbers"],
  ["--stat-2", "--surface", 3, "large tile numbers"],
  ["--stat-3", "--surface", 3, "large tile numbers"],
  ["--stat-4", "--surface", 3, "large tile numbers"],
];

/* The deep brand steps are light-mode text. Dark mode never puts them on a
   dark surface - it uses the lightened --accent - so pairing them there would
   measure something nothing renders. */
const LIGHT_ONLY = [
  ["--brand-600", "--surface", 4.5, "brand text"],
  ["--brand-700", "--surface", 4.5, "brand text"],
  ["--brand-800", "--surface", 4.5, "brand text"],
];

const pairsFor = (theme) => (theme === "light" ? [...COMMON, ...LIGHT_ONLY] : COMMON);

let passed = 0, failed = 0;
for (const theme of ["light", "dark"]) {
  for (const accent of Object.keys(ACCENTS)) {
    const p = palette(accent, theme);
    for (const [fg, bg, min, why] of pairsFor(theme)) {
      const a = p.get(fg), b = p.get(bg);
      if (!a || !b) { console.log(`  MISSING ${theme}/${accent} ${fg} on ${bg}`); failed++; continue; }
      const ratio = contrastRatio(a, b);
      if (ratio >= min) passed++;
      else { failed++; console.log(`  FAIL ${theme}/${accent} ${fg} on ${bg} = ${ratio.toFixed(2)}:1, needs ${min}:1 (${why})`); }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
