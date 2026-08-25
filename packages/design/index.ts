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
}catch(e){}})();`;

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
