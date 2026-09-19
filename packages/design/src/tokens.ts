/**
 * The Summit palette, as data.
 *
 * `tokens.css` is GENERATED from this file — do not hand-edit it; run
 * `pnpm --filter @summit/design build:tokens` and commit the result. A test
 * re-generates it on every PR and fails if the committed CSS disagrees, so an
 * edit made in the wrong file is caught rather than silently overwritten.
 *
 * Why the palette is data rather than a stylesheet: React Native parses no CSS
 * and no `oklch()`, and a hand-copied second palette would drift on the first
 * tenant who picks a different brand colour. This is one source, two renderers
 * — CSS keeps its live `var(--hue)` dial, and the phone resolves the same
 * formula to hex through `oklch.ts`.
 */
import type { Oklch } from "./oklch";

/** A token value: a colour to resolve, or CSS to pass through untouched. */
export type Value = Oklch | { raw: string };
export const raw = (css: string): Value => ({ raw: css });
export const isColour = (v: Value): v is Oklch => !("raw" in v);

export type Decl = { name: string; value: Value; note?: string; before?: string };
export type Group = { title?: string; comment?: string; decls: Decl[] };

const ok = (l: number, c: number, h: Oklch["h"], a?: number): Oklch => ({ l, c, h, a });

/* ── The accents ────────────────────────────────────────────────────────────
   Each turns the hue dial and carries its own six accent values. Those six are
   hand-picked hex rather than steps off the ramp, which is why they are listed
   rather than computed. */
export type AccentName = "blue" | "green" | "pink" | "orange";
export type AccentSet = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentTint: string;
  accentInk: string;
  focusRing: string;
};

export const ACCENTS: Record<AccentName, { hue: number; hueDeep: number; light: AccentSet; dark: AccentSet }> = {
  blue: {
    hue: 185,
    hueDeep: 205,
    light: { accent: "#1b5a6e", accentStrong: "#134555", accentSoft: "#e7f1f3", accentTint: "#f0f7f8", accentInk: "#ffffff", focusRing: "#2e8588" },
    dark:  { accent: "#5fb0c4", accentStrong: "#83c6d6", accentSoft: "#14313a", accentTint: "#101f25", accentInk: "#06181e", focusRing: "#5fb0c4" },
  },
  green: {
    hue: 150,
    hueDeep: 155,
    light: { accent: "#2f5d3a", accentStrong: "#264a2e", accentSoft: "#e9f1ea", accentTint: "#f2f7f3", accentInk: "#ffffff", focusRing: "#4c7d58" },
    dark:  { accent: "#8fc99a", accentStrong: "#aed9b6", accentSoft: "#1a2f1e", accentTint: "#131f15", accentInk: "#0a1c0e", focusRing: "#8fc99a" },
  },
  pink: {
    hue: 355,
    hueDeep: 358,
    light: { accent: "#a83a66", accentStrong: "#8a2d53", accentSoft: "#f7e9f0", accentTint: "#fbf3f7", accentInk: "#ffffff", focusRing: "#c05f88" },
    dark:  { accent: "#e08bb0", accentStrong: "#ecacc7", accentSoft: "#371825", accentTint: "#241019", accentInk: "#2a0917", focusRing: "#e08bb0" },
  },
  orange: {
    hue: 62,
    hueDeep: 55,
    light: { accent: "#b65a1f", accentStrong: "#96491a", accentSoft: "#f8ede2", accentTint: "#fbf5ee", accentInk: "#ffffff", focusRing: "#cf7c42" },
    dark:  { accent: "#e59a5e", accentStrong: "#eeb586", accentSoft: "#362112", accentTint: "#24160b", accentInk: "#291303", focusRing: "#e59a5e" },
  },
};

/** The six accent declarations, in the order the stylesheet lists them. */
export const accentDecls = (set: AccentSet): Decl[] => [
  { name: "--accent", value: raw(set.accent) },
  { name: "--accent-strong", value: raw(set.accentStrong) },
  { name: "--accent-soft", value: raw(set.accentSoft) },
  { name: "--accent-tint", value: raw(set.accentTint) },
  { name: "--accent-ink", value: raw(set.accentInk) },
  { name: "--focus-ring", value: raw(set.focusRing) },
];

const INK = ok(21, 0.042, "hue-deep");
const shadow = (layers: string) => raw(layers);

/* ── Light: everything under :root ───────────────────────────────────────── */
export const LIGHT: Group[] = [
  {
    title: "Hue: the one dial the accent turns",
    comment: `Tuned to the real Summit mark rather than to the placeholder that
     preceded it. Sampled from the asset: #26b6c1 and #3fbdaf on the peaks,
     #145e7b and #113a4c in the shadowed faces — a shade greener and less blue
     than the 190/212 this dial carried.

     Only the HUE angles move, and that is nearly but NOT entirely free:
     WCAG contrast is computed from sRGB relative luminance, not from OKLCH
     lightness, so rotating hue at constant L and C does shift the ratios a
     little. Measured across this 5-degree move:

       ink on white          17.49 -> 17.45
       muted on white         6.69 ->  6.68
       brand-600 on white     6.48 ->  6.42
       brand-700 on white     9.66 ->  9.58
       brand-800 on white    13.91 -> 13.85

     Every pair still clears AA with room to spare. Do not read that as
     licence to spin the dial freely: a larger rotation, particularly toward
     yellow-green where luminance rises fastest, can move a borderline pair
     across 4.5:1. Re-measure if you turn it further than this.

     contrast.mjs now measures this rather than trusting the numbers above.`,
    decls: [
      { name: "--hue", value: raw(String(ACCENTS.blue.hue)), note: "surfaces, borders, light brand steps" },
      { name: "--hue-deep", value: raw(String(ACCENTS.blue.hueDeep)), note: "ink, deep brand steps, shadows" },
    ],
  },
  {
    title: "Brand scale (OKLCH, perceptually uniform)",
    decls: [
      { name: "--brand-50", value: ok(97, 0.014, "hue") },
      { name: "--brand-100", value: ok(92, 0.035, "hue") },
      { name: "--brand-200", value: ok(83, 0.075, "hue") },
      { name: "--brand-300", value: ok(73, 0.110, "hue") },
      { name: "--brand-400", value: ok(64, 0.135, "hue") },
      { name: "--brand-500", value: ok(55, 0.130, "hue-deep") },
      { name: "--brand-600", value: ok(46, 0.115, "hue-deep") },
      { name: "--brand-700", value: ok(37, 0.095, "hue-deep") },
      { name: "--brand-800", value: ok(28, 0.072, "hue-deep") },
      { name: "--brand-900", value: ok(20, 0.050, "hue-deep") },
    ],
  },
  {
    title: "Logo and graphic colours: Mount Etna's fixed defaults",
    comment: `These three stay hardcoded here as the DEFAULT for every tenant — this
     block is never rewritten per-clinic. A per-tenant override now exists
     one layer up: @summit/settings' appearance.logo1/2/3 (org scope), read
     by @summit/design's applyLogoColors() and applied as an inline
     \`style.setProperty("--logo-1", …)\` on <html> by each app's settings
     effects hook (apps/data's SettingsEffects, apps/employee's
     BrandingEffects) — see those two call sites and applyLogoColors' own
     comment before changing this. No override row exists for Mount Etna
     today, so this file's values are still exactly what renders.
     --logo-ink is unused by any current consumer (grep confirmed
     2026-09-01) and has no settings-backed override yet; add one the same
     way if a consumer appears.`,
    decls: [
      { name: "--logo-1", value: ok(64, 0.135, 188) },
      { name: "--logo-2", value: ok(46, 0.115, 200) },
      { name: "--logo-3", value: ok(37, 0.095, 208) },
      { name: "--logo-ink", value: ok(21, 0.042, 212) },
    ],
  },
  {
    title: "Typography",
    decls: [
      { name: "--font-display", value: raw('"Outfit", system-ui, sans-serif') },
      { name: "--font-body", value: raw('"Source Sans 3", system-ui, -apple-system, sans-serif') },
      { name: "--font-mono", value: raw('ui-monospace, "SF Mono", Menlo, monospace') },
      { name: "--text-2xs", value: raw("0.6875rem"), note: "11" },
      { name: "--text-xs", value: raw("0.75rem"), note: "12" },
      { name: "--text-sm", value: raw("0.8125rem"), note: "13" },
      { name: "--text-base", value: raw("0.9375rem"), note: "15" },
      { name: "--text-md", value: raw("1rem"), note: "16" },
      { name: "--text-lg", value: raw("1.125rem"), note: "18" },
      { name: "--text-xl", value: raw("1.25rem"), note: "20" },
      { name: "--text-2xl", value: raw("1.5rem"), note: "24" },
      { name: "--text-3xl", value: raw("1.875rem"), note: "30" },
      { name: "--text-4xl", value: raw("2.25rem"), note: "36" },
    ],
  },
  {
    title: "Spacing (4pt)",
    decls: [1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => ({ name: `--space-${n}`, value: raw(`${n * 4}px`) })),
  },
  {
    title: "Radius",
    decls: [
      { name: "--radius-xs", value: raw("4px") },
      { name: "--radius-sm", value: raw("7px") },
      { name: "--radius-md", value: raw("10px") },
      { name: "--radius-lg", value: raw("14px") },
      { name: "--radius-xl", value: raw("20px") },
      { name: "--radius-full", value: raw("9999px") },
    ],
  },
  {
    title: "Layout",
    comment: `--portalnav-h is the height of the cross-portal bar, and AppNav sets its
     own height from it, so measurement and token cannot drift apart. Anything
     sitting under the bar — the shell, the sidebar, a sticky sub-header —
     offsets by this. The per-app topbar it replaced is gone; --topbar-h with
     it.`,
    decls: [
      { name: "--sidebar-w", value: raw("244px") },
      { name: "--portalnav-h", value: raw("51px") },
    ],
  },
  {
    title: "Motion",
    comment: `One curve everywhere. The older names are kept as aliases so nothing that
     still references them animates on a different curve. See motion.css.`,
    decls: [
      { name: "--ease-editorial", value: raw("cubic-bezier(0.22, 1, 0.36, 1)") },
      { name: "--ease-out-quart", value: raw("var(--ease-editorial)") },
      { name: "--ease-in-out", value: raw("var(--ease-editorial)") },
      { name: "--ease-spring", value: raw("var(--ease-editorial)") },
      { name: "--dur-feedback", value: raw("200ms") },
      { name: "--dur-entrance", value: raw("600ms") },
      { name: "--duration-fast", value: raw("var(--dur-feedback)") },
      { name: "--duration-base", value: raw("var(--dur-feedback)") },
      { name: "--duration-slow", value: raw("var(--dur-entrance)") },
    ],
  },
  {
    title: "Light surfaces, text and borders (brand-tinted neutrals)",
    decls: [
      { name: "--bg", value: ok(94.5, 0.016, "hue") },
      { name: "--surface", value: ok(100, 0, 0) },
      { name: "--surface-2", value: ok(96.5, 0.012, "hue") },
      { name: "--ink", value: INK },
      { name: "--muted", value: ok(47, 0.048, "hue-deep") },
      {
        name: "--faint",
        value: raw("var(--muted)"),
        before: `Two text tones, not three. --faint was a third step below --muted, but at
the 11px it carries — captions, helper text, the uppercase section labels — it
measured 3.0:1 in light and 3.8:1 in dark against the surfaces it lands on,
under the 4.5:1 small-text standard. Darkening it enough to pass put it within
a few points of --muted anyway, so it resolves to --muted and the hierarchy is
ink over muted. The name is kept because a hundred rules use it and because a
third tone can come back here if one is ever wanted.`,
      },
      { name: "--line", value: ok(91, 0.012, "hue") },
      { name: "--line-strong", value: ok(84, 0.018, "hue") },
      { name: "--scrim", value: ok(21, 0.042, "hue-deep", 0.45) },
    ],
  },
  {
    title: "Shadows (tinted toward the brand hue)",
    comment: `React Native has no box-shadow, so these stay raw CSS: the phone builds
     elevation from its own shadow props rather than from this string.`,
    decls: [
      { name: "--shadow-xs", value: shadow("0 1px 2px oklch(21% 0.042 var(--hue-deep) / 0.05)") },
      { name: "--shadow-sm", value: shadow("0 1px 3px oklch(21% 0.042 var(--hue-deep) / 0.07), 0 1px 2px oklch(21% 0.042 var(--hue-deep) / 0.04)") },
      { name: "--shadow-md", value: shadow("0 4px 12px oklch(21% 0.042 var(--hue-deep) / 0.09), 0 2px 4px oklch(21% 0.042 var(--hue-deep) / 0.04)") },
      { name: "--shadow-lg", value: shadow("0 12px 32px oklch(21% 0.042 var(--hue-deep) / 0.11), 0 4px 8px oklch(21% 0.042 var(--hue-deep) / 0.05)") },
      { name: "--shadow-xl", value: shadow("0 24px 48px oklch(21% 0.042 var(--hue-deep) / 0.14), 0 8px 16px oklch(21% 0.042 var(--hue-deep) / 0.06)") },
      { name: "--shadow-card", value: raw("var(--shadow-sm)") },
    ],
  },
  {
    title: "Data accents: the four the Scheduler cycles across stat cards",
    comment: `components.css colours the big tile numbers with these, so they are large
     text as well as chart fills and have to clear 3:1 on the light surfaces.
     2 and 3 sat at 72% and measured 2.03 and 2.20; they join 1 and 4 in the
     high 50s / low 60s, which also evens out a set that was split 58/72.`,
    decls: [
      { name: "--stat-1", value: ok(58, 0.130, 250) },
      { name: "--stat-2", value: ok(61.5, 0.115, 165) },
      { name: "--stat-3", value: ok(64, 0.145, 65) },
      { name: "--stat-4", value: ok(58, 0.155, 355) },
    ],
  },
  {
    title: "Semantic status (accent-invariant)",
    decls: [
      { name: "--good", value: ok(50.5, 0.148, 152) },
      { name: "--good-soft", value: ok(94, 0.040, 152) },
      { name: "--warn", value: ok(53.5, 0.130, 68) },
      { name: "--warn-soft", value: ok(95, 0.045, 68) },
      { name: "--danger", value: ok(54, 0.205, 25) },
      { name: "--danger-soft", value: ok(96, 0.035, 25) },
      { name: "--info", value: ok(52, 0.130, 250) },
      { name: "--info-soft", value: ok(95, 0.030, 250) },
    ],
  },
  {
    title: "Accent: BLUE (Summit teal) is the default ramp",
    decls: accentDecls(ACCENTS.blue.light),
  },
  {
    title: "Scheduler vocabulary (same values, its own names)",
    decls: [
      { name: "--color-background-primary", value: raw("var(--surface)") },
      { name: "--color-background-secondary", value: raw("var(--surface-2)") },
      { name: "--color-background-tertiary", value: raw("var(--bg)") },
      { name: "--color-border-primary", value: raw("var(--accent)") },
      { name: "--color-border-secondary", value: raw("var(--line-strong)") },
      { name: "--color-border-tertiary", value: raw("var(--line)") },
      { name: "--color-text-primary", value: raw("var(--ink)") },
      { name: "--color-text-secondary", value: raw("var(--muted)") },
      { name: "--color-text-tertiary", value: raw("var(--faint)") },
      { name: "--color-success", value: raw("var(--good)") },
      { name: "--color-success-subtle", value: raw("var(--good-soft)") },
      { name: "--color-warning", value: raw("var(--warn)") },
      { name: "--color-warning-subtle", value: raw("var(--warn-soft)") },
      { name: "--color-error", value: raw("var(--danger)") },
      { name: "--color-error-subtle", value: raw("var(--danger-soft)") },
    ],
  },
];

/* ── Dark: the overrides, written once and emitted under both selectors ────
   The stylesheet needs this set twice — once inside
   @media (prefers-color-scheme: dark) for "follow the OS", once under
   [data-theme="dark"] for "the user chose dark". Before this file those sixty
   lines were maintained by hand in both places. */
export const DARK: Decl[] = [
  { name: "--bg", value: ok(17, 0.020, "hue-deep") },
  { name: "--surface", value: ok(21, 0.022, "hue-deep") },
  { name: "--surface-2", value: ok(25, 0.024, "hue-deep") },
  { name: "--ink", value: ok(94, 0.012, "hue") },
  { name: "--muted", value: ok(72, 0.026, "hue") },
  { name: "--faint", value: raw("var(--muted)"), note: "two tones — see the note in :root" },
  { name: "--line", value: ok(30, 0.022, "hue-deep") },
  { name: "--line-strong", value: ok(38, 0.026, "hue-deep") },
  { name: "--scrim", value: ok(12, 0.020, "hue-deep", 0.62) },
  { name: "--shadow-xs", value: shadow("0 1px 2px oklch(0% 0 0 / 0.30)") },
  { name: "--shadow-sm", value: shadow("0 1px 3px oklch(0% 0 0 / 0.38), 0 1px 2px oklch(0% 0 0 / 0.24)") },
  { name: "--shadow-md", value: shadow("0 4px 12px oklch(0% 0 0 / 0.44), 0 2px 4px oklch(0% 0 0 / 0.26)") },
  { name: "--shadow-lg", value: shadow("0 12px 32px oklch(0% 0 0 / 0.50), 0 4px 8px oklch(0% 0 0 / 0.30)") },
  { name: "--shadow-xl", value: shadow("0 24px 48px oklch(0% 0 0 / 0.56), 0 8px 16px oklch(0% 0 0 / 0.34)") },
  { name: "--stat-1", value: ok(72, 0.120, 250) },
  { name: "--stat-2", value: ok(80, 0.110, 165) },
  { name: "--stat-3", value: ok(80, 0.130, 65) },
  { name: "--stat-4", value: ok(72, 0.140, 355) },
  { name: "--good", value: ok(76, 0.150, 152) },
  { name: "--good-soft", value: ok(30, 0.060, 152) },
  { name: "--warn", value: ok(80, 0.130, 74) },
  { name: "--warn-soft", value: ok(31, 0.055, 68) },
  { name: "--danger", value: ok(70, 0.160, 25) },
  { name: "--danger-soft", value: ok(31, 0.075, 25) },
  { name: "--info", value: ok(76, 0.110, 250) },
  { name: "--info-soft", value: ok(30, 0.055, 250) },
  ...accentDecls(ACCENTS.blue.dark),
];

export const NON_DEFAULT_ACCENTS: AccentName[] = ["green", "pink", "orange"];
