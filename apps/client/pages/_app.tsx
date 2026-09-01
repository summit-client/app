import '@summit/design/tokens.css'
import '@summit/design/components.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import * as React from 'react'
import { AppNav } from '@summit/nav'
import { parseVisiblePortals } from '@summit/portals'
import { getIdentity, type AppRole } from '@summit/session'
import { getSetting, initSettings, onSettingsChange } from '@summit/settings'

export default function App({ Component, pageProps }: AppProps) {
  const [role, setRole] = React.useState<AppRole | null | undefined>(undefined)

  React.useEffect(() => {
    let cancelled = false
    getIdentity().then((identity) => {
      if (!cancelled) setRole(identity.appRole)
    })
    return () => { cancelled = true }
  }, [])

  // First use of @summit/settings in this app - same call/timing every
  // other portal's session bootstrap already uses (see apps/data and
  // apps/employee's SessionProvider, apps/scheduler's own _app.tsx). Only
  // consumer today is nav.visiblePortals below.
  React.useEffect(() => { if (role) void initSettings() }, [role])

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
      <AppNav activeKey="client" role={role} visiblePortals={visiblePortals} />
      <Component {...pageProps} />
    </>
  )
}
