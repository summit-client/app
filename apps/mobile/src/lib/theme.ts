/**
 * The Summit palette, on a phone.
 *
 * Reads `@summit/design`'s TypeScript source — the same formula the web's
 * `tokens.css` is generated from — and resolves it to values React Native can
 * use. Nothing here restates a colour: a value that appears in this file and
 * not in `packages/design/src/tokens.ts` is a bug.
 *
 * What does not come across, and why: CSS custom properties, `oklch()`,
 * `box-shadow` and font stacks have no React Native equivalent, so shadows and
 * font families are dropped here and the phone builds elevation from its own
 * props. Colours, spacing, radii and type sizes are the portable part.
 */
import {
  ACCENTS,
  DARK,
  LIGHT,
  accentDecls,
  isColour,
  type AccentName,
  type Decl,
} from "@summit/design/tokens";
import { oklchToHex } from "@summit/design/oklch";

export type ColorScheme = "light" | "dark";

/** `--brand-500` → `brand500`, so a screen reads `theme.colors.brand500`. */
const camel = (name: string) =>
  name.replace(/^--/, "").replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const HEX = /^#[0-9a-f]{3,8}$/i;
const VAR = /^var\(--([a-z0-9-]+)\)$/i;
const PX = /^(-?[\d.]+)px$/;
const REM = /^(-?[\d.]+)rem$/;

/** Declarations in cascade order: light first, then the dark overrides. */
function declsFor(accent: AccentName, scheme: ColorScheme): Decl[] {
  const a = ACCENTS[accent];
  const light = [...LIGHT.flatMap((g) => g.decls), ...accentDecls(a.light)];
  return scheme === "light" ? light : [...light, ...DARK, ...accentDecls(a.dark)];
}

/**
 * Resolving `var(--muted)` needs whatever `--muted` ended up as, and the dark
 * overrides land after the light values, so the map is built in cascade order
 * and later writes win — the same thing the browser does, minus the cascade.
 */
function resolve(accent: AccentName, scheme: ColorScheme) {
  const { hue, hueDeep } = ACCENTS[accent];
  const colors: Record<string, string> = {};
  const numbers: Record<string, number> = {};

  for (const d of declsFor(accent, scheme)) {
    const key = camel(d.name);
    if (isColour(d.value)) {
      colors[key] = oklchToHex(d.value, hue, hueDeep);
      continue;
    }
    const css = d.value.raw.trim();
    if (HEX.test(css)) {
      colors[key] = css;
      continue;
    }
    const alias = VAR.exec(css);
    if (alias) {
      const target = camel(`--${alias[1]}`);
      if (target in colors) colors[key] = colors[target];
      else if (target in numbers) numbers[key] = numbers[target];
      continue;
    }
    const px = PX.exec(css);
    if (px) {
      numbers[key] = Number(px[1]);
      continue;
    }
    const rem = REM.exec(css);
    // 16px root, set by tokens.css's own `html { font-size: 16px }`.
    if (rem) numbers[key] = Number(rem[1]) * 16;
    // Anything left — font stacks, easings, durations, box-shadows — has no
    // React Native form and is deliberately not carried over.
  }
  return { colors, numbers };
}

export type Theme = {
  accent: AccentName;
  scheme: ColorScheme;
  colors: Record<string, string>;
  /** Spacing, radii and type sizes, in points. */
  size: Record<string, number>;
};

const cache = new Map<string, Theme>();

export function buildTheme(accent: AccentName = "blue", scheme: ColorScheme = "light"): Theme {
  const key = `${accent}/${scheme}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { colors, numbers } = resolve(accent, scheme);
  const theme: Theme = { accent, scheme, colors, size: numbers };
  cache.set(key, theme);
  return theme;
}

export type { AccentName };
