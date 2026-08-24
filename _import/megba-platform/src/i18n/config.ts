/**
 * i18n configuration.
 *
 * Phase 1 ships a data-driven UI-string dictionary and a language switcher so
 * the multilingual architecture is real and the enabled-language list is
 * CMS-editable (see src/content/languages.ts). Phase 2 upgrades this to full
 * routing-based i18n (recommended: next-intl) with `[locale]` route segments
 * and hreflang, the message catalogue below is designed to port directly.
 */
export { defaultLocale, localeCodes, enabledLanguages, languages } from "@/content/languages";
export type { Language } from "@/content/languages";

export const LOCALE_COOKIE = "megba_locale";
