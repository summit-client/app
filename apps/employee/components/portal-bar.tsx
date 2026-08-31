"use client";

/**
 * The cross-portal bar, with the viewer's role once it resolves.
 *
 * Reads identity directly from @summit/session rather than through
 * <SessionProvider> - the bar sits outside it in the layout, and its cache is
 * shared, so this costs no extra round trip.
 */

import * as React from "react";
import { AppNav } from "@summit/nav";
import { signOutUrl } from "@summit/portals";
import { getIdentity, type AppRole } from "@summit/session";

export function PortalBar(props: { activeKey: string; settingsHref?: string }) {
  const [role, setRole] = React.useState<AppRole | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    getIdentity().then((identity) => {
      if (!cancelled) setRole(identity.appRole);
    });
    return () => { cancelled = true; };
  }, []);

  // Mirrors AdminAccessGate's check in app/admin/page.tsx exactly - admin,
  // supervisor, or scheduler (scheduler's Admin console access is a scoped
  // exception, not a portal-wide role promotion; see that gate's own
  // comment). Keep the two in sync if either changes: this only controls
  // whether the link is offered, that gate is what actually enforces it.
  const showAdminLink = role === "admin" || role === "supervisor" || role === "scheduler";

  return (
    <AppNav {...props} role={role} adminHref={showAdminLink ? "/admin" : undefined} signOutHref={signOutUrl()} />
  );
}
