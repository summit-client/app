import '@summit/design/tokens.css'
import '@summit/design/components.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import * as React from 'react'
import { AppNav } from '@summit/nav'
import { parseVisiblePortals, profileUrl } from '@summit/portals'
import { clearIdentity, getIdentity, subscribeToAuthChanges, type AppRole } from '@summit/session'
import { clearSettings, getSetting, initSettings, onSettingsChange } from '@summit/settings'
import { ToastHost } from '@summit/toast'
import { computeClientPriorityStatus, type PriorityStatus } from '../lib/priority-status'

export default function App({ Component, pageProps }: AppProps) {
  const [role, setRole] = React.useState<AppRole | null | undefined>(undefined)
  const [fullName, setFullName] = React.useState<string | null>(null)
  const [priorityStatus, setPriorityStatus] = React.useState<PriorityStatus | null>(null)

  const [identityEpoch, setIdentityEpoch] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    getIdentity().then((identity) => {
      if (!cancelled) {
        setRole(identity.appRole)
        setFullName(identity.fullName)
      }
    })
    return () => { cancelled = true }
  }, [identityEpoch])

  // Identity and settings are both module-level caches latched on first read.
  // This portal shows one family's children, so a tab left open while the
  // user signed out (or signed in as someone else) elsewhere would keep
  // serving the previous person's role, name and settings from a warm cache.
  // Bumping the epoch re-runs the effect above rather than duplicating its
  // body; signing out clears without re-resolving, since getIdentity() would
  // otherwise fire getUser() for someone who has just left.
  React.useEffect(() => subscribeToAuthChanges((event) => {
    clearIdentity()
    clearSettings()
    if (event === 'SIGNED_OUT') {
      setRole(null)
      setFullName(null)
      return
    }
    setIdentityEpoch((n) => n + 1)
  }), [])

  // The profile avatar's completion ring. Only meaningful for the client
  // role (the checklist this tracks is household/child data), same
  // "fully self-contained, no provider needed" shape as apps/employee's
  // equivalent.
  React.useEffect(() => {
    if (role !== 'client') return
    let cancelled = false
    computeClientPriorityStatus()
      .then((status) => { if (!cancelled) setPriorityStatus(status) })
      .catch(() => { /* no ring rather than a broken bar */ })
    return () => { cancelled = true }
  }, [role])

  // First use of @summit/settings in this app - same call/timing every
  // other portal's session bootstrap already uses (see apps/data and
  // apps/employee's SessionProvider, apps/scheduler's own _app.tsx). Only
  // consumer today is nav.visiblePortals below.
  // Keyed on the epoch as well as the role: clearSettings() above drops the
  // cache, and signing back in as someone with the SAME role would otherwise
  // leave this effect un-re-run and every setting reading its registry
  // default for the rest of the page's life.
  React.useEffect(() => { if (role) void initSettings() }, [role, identityEpoch])

  // `nav.visiblePortals` (@summit/settings, "Navigation" section) - an
  // org-level override AppNav uses to further restrict this role's portal
  // pills. No org has set this yet, so getSetting() returns its default
  // ("") and parseVisiblePortals("") is `null` - the "no override" case,
  // i.e. today's exact behavior. See @summit/portals' portalsFor().
  const [, forceNav] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => onSettingsChange(forceNav), [])
  const visiblePortals = parseVisiblePortals(String(getSetting('nav.visiblePortals')))

  return (
    <>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <AppNav activeKey="client" role={role} visiblePortals={visiblePortals} profileHref={profileUrl(role)} profileName={fullName} priorityStatus={priorityStatus} />
      {/* One per portal, mounted beside the page rather than inside it so a
          toast survives a route change mid-save. */}
      <ToastHost />
      <Component {...pageProps} />
    </>
  )
}
