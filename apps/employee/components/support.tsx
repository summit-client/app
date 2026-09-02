"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { getSetting } from "@summit/settings";
import { SupportButton as SharedSupportButton, DEFAULT_SUPPORT_EMAIL } from "@summit/nav";

/**
 * This app's binding for the shared Troubleshoot / feature-request control.
 *
 * The control itself moved to @summit/nav so every portal has one, not just
 * this app. What stayed here is the part that is genuinely this app's: reading
 * the org's configured address and name out of @summit/settings, and getting
 * the pathname from the App Router. apps/client and apps/scheduler are Pages
 * Router and supply theirs a different way, which is exactly why the shared
 * component takes it as a prop rather than importing a router hook.
 */
export function SupportButton() {
  const pathname = usePathname();

  // "MySummitHR" is this app's own product name, not this clinic's - see
  // docs/context/product.md's multi-tenant-readiness item 8. org.name already
  // exists in the settings registry and is readable here (this component is
  // "use client", unlike app/layout.tsx's title/brand text - see the comment
  // there before doing the same conversion there). Falls back to the literal
  // product name only if org.name is ever genuinely empty.
  const orgName = String(getSetting("org.name") ?? "").trim();
  const brand = orgName ? `${orgName} HR` : "MySummitHR";

  // A clinic that has never opened the settings screen has no stored row, and
  // the registry default applies. Coalesced anyway so an empty stored string
  // cannot produce `mailto:?subject=...`, which opens a blank compose window
  // and looks like the report went nowhere.
  const to = String(getSetting("support.devEmail") ?? "").trim() || DEFAULT_SUPPORT_EMAIL;

  return (
    <SharedSupportButton
      to={to}
      brand={brand}
      moduleName={`${brand} (apps/employee)`}
      pathname={pathname ?? ""}
      placement="sidebar"
    />
  );
}
