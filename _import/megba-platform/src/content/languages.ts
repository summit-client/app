/**
 * Enabled platform languages.
 *
 * IMPORTANT: This list is intentionally data-driven (not hard-coded into
 * components) so MEGBA administrators can add or remove languages from the CMS
 * without a code change. In production this array is seeded into the `Language`
 * table (see prisma/schema.prisma) and edited from the Super Admin portal.
 *
 * `reviewed` marks whether professionally-reviewed localized content exists.
 * Machine-assisted translation must be professionally reviewed before a locale
 * is represented as formally localized clinical/educational content.
 */
export type Language = {
  code: string; // BCP-47
  label: string; // English name
  nativeLabel: string; // endonym
  dir: "ltr" | "rtl";
  enabled: boolean;
  reviewed: boolean;
};

export const languages: Language[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", enabled: true, reviewed: true },
  { code: "it", label: "Italian", nativeLabel: "Italiano", dir: "ltr", enabled: true, reviewed: true },
  { code: "bg", label: "Bulgarian", nativeLabel: "Български", dir: "ltr", enabled: true, reviewed: true },
  { code: "fr", label: "French", nativeLabel: "Français", dir: "ltr", enabled: true, reviewed: false },
  { code: "es", label: "Spanish", nativeLabel: "Español", dir: "ltr", enabled: true, reviewed: false },
  { code: "de", label: "German", nativeLabel: "Deutsch", dir: "ltr", enabled: true, reviewed: false },
  { code: "ro", label: "Romanian", nativeLabel: "Română", dir: "ltr", enabled: true, reviewed: false },
  { code: "pl", label: "Polish", nativeLabel: "Polski", dir: "ltr", enabled: true, reviewed: false },
  { code: "cs", label: "Czech", nativeLabel: "Čeština", dir: "ltr", enabled: true, reviewed: false },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", dir: "ltr", enabled: true, reviewed: false },
];

export const defaultLocale = "en";

export const enabledLanguages = () => languages.filter((l) => l.enabled);
export const localeCodes = () => enabledLanguages().map((l) => l.code);
