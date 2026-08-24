"use client";

import * as React from "react";
import { AppShell } from "@/components/portal/app-shell";
import { Dashboard, SectionPreview } from "@/components/portal/dashboard";
import type { PortalConfig } from "@/content/portal";

/** Assembles a role's portal: app shell + data-driven dashboard/sections. */
export function PortalApp({ config }: { config: PortalConfig }) {
  const [active, setActive] = React.useState("Dashboard");
  const isDashboard = active === "Dashboard";

  return (
    <AppShell
      roleLabel={config.roleLabel}
      nav={config.nav}
      secondaryNav={config.secondaryNav}
      title={isDashboard ? config.title : active}
      active={active}
      onSelect={setActive}
    >
      {isDashboard ? (
        <Dashboard data={config.dashboard} />
      ) : (
        <SectionPreview label={active} onBack={() => setActive("Dashboard")} />
      )}
    </AppShell>
  );
}
