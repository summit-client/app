"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { getSetting } from "@summit/settings";
import { SupportButton, DEFAULT_SUPPORT_EMAIL } from "@summit/nav";

/**
 * This app's binding for the shared Troubleshoot / feature-request control.
 *
 * Same shape as apps/employee's: the control lives in @summit/nav so every
 * portal has one, and each app supplies the two things that genuinely differ -
 * the org's configured address, and a pathname from whichever router it uses.
 */
export function ClinicianSupportButton() {
  const pathname = usePathname();
  const orgName = String(getSetting("org.name") ?? "").trim();
  // An empty stored string would produce `mailto:?subject=...`, which opens a
  // blank compose window and reads as though the report went nowhere.
  const to = String(getSetting("support.devEmail") ?? "").trim() || DEFAULT_SUPPORT_EMAIL;

  return (
    <SupportButton
      to={to}
      brand={orgName || "Summit"}
      moduleName="Clinician (apps/data)"
      pathname={pathname ?? ""}
      placement="sidebar"
    />
  );
}
