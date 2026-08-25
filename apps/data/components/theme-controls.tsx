"use client";

import * as React from "react";
import {
  ACCENTS, applyAccent, applyTheme, currentAccent, currentTheme,
  type Accent, type Theme,
} from "@summit/design";

/** Swatch colors shown in the picker (light-ramp accents; recognizable in both themes). */
const SWATCH: Record<Accent, string> = {
  blue: "#1b5a6e",
  green: "#2f5d3a",
  pink: "#a83a66",
  orange: "#b65a1f",
};

export function ThemeControls() {
  const [theme, setTheme] = React.useState<Theme>("system");
  const [accent, setAccent] = React.useState<Accent>("blue");

  React.useEffect(() => {
    setTheme(currentTheme());
    setAccent(currentAccent());
  }, []);

  const cycleTheme = () => {
    const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    applyTheme(next);
  };

  const pickAccent = (a: Accent) => {
    setAccent(a);
    applyAccent(a);
  };

  const themeLabel = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div role="radiogroup" aria-label="Accent colour" style={{ display: "flex", gap: 7 }}>
        {ACCENTS.map((a) => (
          <button
            key={a.key}
            role="radio"
            aria-checked={accent === a.key}
            aria-label={a.label}
            title={a.label}
            onClick={() => pickAccent(a.key)}
            style={{
              width: 22, height: 22, borderRadius: "50%", cursor: "pointer",
              background: SWATCH[a.key],
              border: accent === a.key ? "2px solid var(--ink)" : "2px solid var(--line-strong)",
              boxShadow: accent === a.key ? "0 0 0 2px var(--surface)" : "none",
              padding: 0,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={cycleTheme}
        className="btn secondary"
        aria-label={`Theme: ${themeLabel}. Activate to change.`}
        style={{ minWidth: 84 }}
      >
        {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️"} {themeLabel}
      </button>
    </div>
  );
}
