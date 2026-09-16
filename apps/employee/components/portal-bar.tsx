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
import { parseVisiblePortals, profileUrl, signOutUrl } from "@summit/portals";
import { getIdentity, type AppRole } from "@summit/session";
import { getSetting, onSettingsChange } from "@summit/settings";
import { getProgress, isHubLoaded, loadHub, onHubChange, priorityProgress } from "@/lib/hub";
import { getSession } from "@/lib/session";

type PriorityStatus = { percent: number; state: "critical" | "important" | "complete"; label: string };

export function PortalBar(props: { activeKey: string; settingsHref?: string }) {
  const [role, setRole] = React.useState<AppRole | null | undefined>(undefined);
  const [fullName, setFullName] = React.useState<string | null>(null);
  const [priorityStatus, setPriorityStatus] = React.useState<PriorityStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getIdentity().then((identity) => {
      if (!cancelled) {
        setRole(identity.appRole);
        setFullName(identity.fullName);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // The profile avatar's completion ring (@summit/nav's priorityStatus prop)
  // needs the onboarding hub snapshot, which <HubGate> loads per-screen -
  // this bar sits outside it (see file header), so it is never guaranteed to
  // exist yet. Loads its own copy when nothing has loaded one already
  // (getSession() re-maps @summit/session's already-cached identity, so
  // that part costs nothing extra; loadHub() itself does cost a second
  // Supabase read alongside whatever the screen's own <HubGate> triggers -
  // accepted for now rather than standing up a second, lighter query for
  // one ring's three numbers). onHubChange() keeps the ring in sync with
  // every later load or mutation, from either source.
  React.useEffect(() => {
    let cancelled = false;
    const recompute = () => {
      if (cancelled || !isHubLoaded()) return;
      setPriorityStatus(priorityProgress(getProgress()));
    };
    if (isHubLoaded()) {
      recompute();
    } else {
      getSession()
        .then((session) => (session.problem ? undefined : loadHub(session)))
        .then(recompute)
        .catch(() => { /* no ring rather than a broken bar */ });
    }
    return onHubChange(recompute);
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
      profileHref={profileUrl(role)}
      profileName={fullName}
      priorityStatus={priorityStatus}
      signOutHref={signOutUrl()}
    />
  );
}
