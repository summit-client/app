/**
 * UI-string dictionaries.
 *
 * English is complete. Other locales fall back to English for any missing key
 * (see getDictionary). This mirrors how professionally-reviewed translations
 * are added incrementally per locale, never machine-published as "localized"
 * without review (see languages.ts `reviewed` flag).
 */
export type Dictionary = typeof en;

const en = {
  nav: {
    signIn: "Sign in",
    getStarted: "Partner with MEGBA",
    skipToContent: "Skip to main content",
  },
  common: {
    demoContent: "Demonstration content",
    verified: "Verified",
    learnMore: "Learn more",
    readMore: "Read more",
    viewAll: "View all",
    required: "required",
    submit: "Submit",
    languageSwitcher: "Language",
  },
  home: {
    heroCtaPrimary: "Partner With MEGBA",
    heroCtaSecondary: "Explore the Academies",
  },
};

// Italian & Bulgarian are the professionally-reviewed priority languages.
// (Bulgarian copy should receive a final native-speaker sign-off before launch.)
const it: DeepPartial<Dictionary> = {
  nav: {
    signIn: "Accedi",
    getStarted: "Collabora con MEGBA",
    skipToContent: "Vai al contenuto principale",
  },
  common: {
    verified: "Verificato",
    learnMore: "Scopri di più",
    readMore: "Leggi di più",
    viewAll: "Vedi tutto",
    required: "obbligatorio",
    submit: "Invia",
    languageSwitcher: "Lingua",
  },
  home: { heroCtaPrimary: "Collabora con MEGBA", heroCtaSecondary: "Esplora le accademie" },
};

const bg: DeepPartial<Dictionary> = {
  nav: {
    signIn: "Вход",
    getStarted: "Партнирайте с MEGBA",
    skipToContent: "Към основното съдържание",
  },
  common: {
    verified: "Проверено",
    learnMore: "Научете повече",
    readMore: "Прочетете повече",
    viewAll: "Вижте всички",
    required: "задължително",
    submit: "Изпрати",
    languageSwitcher: "Език",
  },
  home: { heroCtaPrimary: "Партнирайте с MEGBA", heroCtaSecondary: "Разгледайте академиите" },
};

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

const dictionaries: Record<string, DeepPartial<Dictionary>> = { en, it, bg };

/** Deep-merge a locale dictionary over the English base. */
export function getDictionary(locale: string): Dictionary {
  const target = dictionaries[locale] ?? {};
  return deepMerge(en, target) as Dictionary;
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const o = override[key];
    const b = (base as any)[key];
    out[key] =
      o && typeof o === "object" && b && typeof b === "object" && !Array.isArray(o)
        ? deepMerge(b, o as any)
        : (o as any);
  }
  return out;
}
