"use client";

import * as React from "react";
import { Globe, Check } from "lucide-react";
import { enabledLanguages } from "@/content/languages";
import { LOCALE_COOKIE } from "@/i18n/config";
import { applyTranslation } from "@/components/layout/google-translate";
import { cn } from "@/lib/utils";

/**
 * Language switcher. Translates every page into the enabled languages via the
 * Google Translate engine (see GoogleTranslate). The enabled list is
 * data-driven / CMS-editable. Machine translation is a convenience; formally
 * localized content is the Phase 2 next-intl upgrade.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const langs = enabledLanguages();
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState("en");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_COOKIE);
    if (stored) setCurrent(stored);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (code: string) => {
    setCurrent(code);
    window.localStorage.setItem(LOCALE_COOKIE, code);
    document.documentElement.lang = code;
    applyTranslation(code); // translate every page into the chosen language
    setOpen(false);
  };

  // Re-apply a stored preference once the translate engine is ready.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_COOKIE);
    if (stored && stored !== "en") applyTranslation(stored);
  }, []);

  const active = langs.find((l) => l.code === current) ?? langs[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-forest hover:bg-forest/5"
      >
        <Globe className="h-4 w-4" aria-hidden />
        {compact ? active.code.toUpperCase() : active.nativeLabel}
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 z-50 mt-2 max-h-72 w-52 overflow-auto rounded-lg border border-border bg-card p-1 shadow-lift"
        >
          {langs.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === current}
                onClick={() => choose(l.code)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-forest/5",
                  l.code === current && "font-medium",
                )}
              >
                <span>
                  {l.nativeLabel}
                  <span className="ml-1.5 text-xs text-muted-foreground">{l.label}</span>
                </span>
                {l.code === current ? <Check className="h-4 w-4 text-forest" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
