"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const KEY = "megba_cookie_consent";

/** Privacy-first cookie banner, defaults to essential-only. */
export function CookieConsent() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!window.localStorage.getItem(KEY)) setVisible(true);
  }, []);

  const decide = (choice: "essential" | "all") => {
    window.localStorage.setItem(KEY, choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[65] p-4"
    >
      <div className="container max-w-3xl rounded-xl border border-border bg-card p-5 shadow-lift">
        <p className="text-sm text-muted-foreground">
          We use essential cookies to run the platform. With your consent we may also use analytics
          cookies. We default to the most privacy-preserving option. See our{" "}
          <Link href="/legal/cookies" className="font-medium text-forest underline">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide("all")}>
            Accept all
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("essential")}>
            Essential only
          </Button>
        </div>
      </div>
    </div>
  );
}
