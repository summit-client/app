"use client";

import * as React from "react";
import { localeCodes } from "@/content/languages";

/**
 * Automatic page translation via Google Translate.
 *
 * This powers the header language toggle so visitors can read every page in the
 * enabled languages immediately. It is *machine* translation, for formally
 * localized, professionally-reviewed content, the Phase 2 upgrade is next-intl
 * with reviewed message catalogues (see src/i18n/).
 *
 * The hidden element hosts Google's widget; `applyTranslation()` drives it.
 */
export function GoogleTranslate() {
  React.useEffect(() => {
    const w = window as unknown as {
      googleTranslateElementInit?: () => void;
      google?: { translate?: { TranslateElement: new (opts: object, el: string) => void } };
    };

    w.googleTranslateElementInit = () => {
      const TranslateElement = w.google?.translate?.TranslateElement;
      if (TranslateElement) {
        new TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: localeCodes().join(","),
            autoDisplay: false,
          },
          "google_translate_element",
        );
      }
    };

    if (!document.getElementById("google-translate-script")) {
      const s = document.createElement("script");
      s.id = "google-translate-script";
      s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      document.body.appendChild(s);
    }
  }, []);

  return <div id="google_translate_element" aria-hidden className="sr-only" />;
}

/** Switch the page to `code` (BCP-47). Persists via the googtrans cookie. */
export function applyTranslation(code: string) {
  const value = `/en/${code}`;
  document.cookie = `googtrans=${value};path=/`;
  try {
    document.cookie = `googtrans=${value};path=/;domain=.${location.hostname}`;
  } catch {
    /* ignore (e.g. localhost) */
  }

  const tryApply = (attempt = 0) => {
    const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (combo) {
      combo.value = code;
      combo.dispatchEvent(new Event("change"));
    } else if (attempt < 50) {
      setTimeout(() => tryApply(attempt + 1), 150);
    }
  };
  tryApply();
}
