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
import { parseVisiblePortals, signOutUrl } from "@summit/portals";
import { getIdentity, type AppRole } from "@summit/session";
import { getSetting, onSettingsChange } from "@summit/settings";

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

  // `nav.visiblePortals` (@summit/settings, "Navigation" section). PortalBar
  // sits outside <SessionProvider> (see file header), but the settings
  // cache and its onSettingsChange listeners are module-level, not scoped
  // to that provider, so this still picks up the real value once whichever
  // component calls initSettings() resolves it - same "flash of defaults,
  // then real value" trade-off @summit/settings' own doc comment describes.
  // No org has set this yet, so today getSetting() always returns its
  // default ("") and parseVisiblePortals("") is `null` - portalsFor()'s
  // "no override" case, i.e. today's exact behavior.
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onSettingsChange(() => force()), []);
  const visiblePortals = parseVisiblePortals(String(getSetting("nav.visiblePortals")));

  return (
    <AppNav
      {...props}
      role={role}
      visiblePortals={visiblePortals}
      adminHref={showAdminLink ? "/admin" : undefined}
      signOutHref={signOutUrl()}
    />
  );
}
