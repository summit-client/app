/**
 * @summit/design — tokens + theme management for every Summit portal.
 * Import "@summit/design/tokens.css" once per app; render <ThemeScript /> in
 * the document head so the stored theme applies before first paint.
 */

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "green" | "pink" | "orange";

export const ACCENTS: { key: Accent; label: string }[] = [
  { key: "blue", label: "Summit Blue" },
  { key: "green", label: "Forest Green" },
  { key: "pink", label: "Rose Pink" },
  { key: "orange", label: "Amber Orange" },
];

export const THEME_STORAGE_KEY = "summit-theme";
export const ACCENT_STORAGE_KEY = "summit-accent";

/** Runs before paint: applies stored theme/accent to <html>. Keep dependency-free. */
export const themeInitScript = `(function(){try{
var t=localStorage.getItem("${THEME_STORAGE_KEY}");
if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);
var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");
if(a==="green"||a==="pink"||a==="orange")document.documentElement.setAttribute("data-accent",a);
}catch(e){}
try{document.documentElement.classList.add("motion-ready");}catch(e){}})();`;

export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "system") {
    el.removeAttribute("data-theme");
    try { localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* private mode */ }
  } else {
    el.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* private mode */ }
  }
}

export function applyAccent(accent: Accent): void {
  const el = document.documentElement;
  if (accent === "blue") {
    el.removeAttribute("data-accent"); // blue is the default ramp
    try { localStorage.removeItem(ACCENT_STORAGE_KEY); } catch { /* private mode */ }
  } else {
    el.setAttribute("data-accent", accent);
    try { localStorage.setItem(ACCENT_STORAGE_KEY, accent); } catch { /* private mode */ }
  }
}

export function currentTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

export function currentAccent(): Accent {
  const a = document.documentElement.getAttribute("data-accent");
  return a === "green" || a === "pink" || a === "orange" ? a : "blue";
}

/* ---- per-tenant logo colours -------------------------------------------
   --logo-1/2/3 in tokens.css stay fixed at Mount Etna's brand colours as the
   CSS default — that block is never edited per tenant. A clinic that wants
   its own logo colours instead does so through @summit/settings'
   appearance.logo1/2/3 (org scope; see packages/settings/index.ts), and the
   resolved value is pushed onto <html> as an inline custom-property
   override by applyLogoColors() below, called from each app's own
   settings-effects hook (apps/data's SettingsEffects, apps/employee's
   BrandingEffects — @summit/design intentionally has no dependency on
   @summit/settings/@summit/session, so those two call sites do the
   resolve() and pass this function only the already-resolved override, or
   null/undefined to fall back to the CSS default).

   Contrast is NOT validated here. Today's only real consumer
   (apps/employee/components/grove.tsx) draws --logo-2 as a decorative SVG
   fill, with two spots (SummitPeaks' percent label, TheClimb's camp
   labels) that render fixed-colour text on top of it — both were given a
   var(--surface) stroke halo so they read at AA regardless of what
   --logo-2 resolves to (see grove.tsx). Any future consumer that draws
   text or an icon using --logo-1/2/3, or on top of a shape filled with
   one, needs the same kind of guarantee (or its own contrast check)
   before an arbitrary tenant value can reach it — this function will
   apply whatever string it's given without checking. */

export type LogoTone = "logo1" | "logo2" | "logo3";
export const LOGO_TONES: LogoTone[] = ["logo1", "logo2", "logo3"];

const LOGO_CSS_VAR: Record<LogoTone, string> = {
  logo1: "--logo-1",
  logo2: "--logo-2",
  logo3: "--logo-3",
};

/**
 * Applies (or clears) the per-tenant logo colour overrides on <html>. Pass
 * the resolved override for a tone, or null/undefined/"" to remove any
 * inline override and fall back to tokens.css's fixed default for that
 * tone — callers should pass null rather than a resolved *default* value,
 * so an org with no override still renders from the static CSS file byte
 * for byte, not a copy of the same colour set inline.
 */
export function applyLogoColors(colors: Partial<Record<LogoTone, string | null | undefined>>): void {
  const el = document.documentElement;
  for (const tone of LOGO_TONES) {
    const value = colors[tone];
    if (value) el.style.setProperty(LOGO_CSS_VAR[tone], value);
    else el.style.removeProperty(LOGO_CSS_VAR[tone]);
  }
}
