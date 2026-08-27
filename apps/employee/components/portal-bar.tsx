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

  return <AppNav {...props} role={role} />;
}
