import '@summit/design/tokens.css'
import '@summit/design/components.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import * as React from 'react'
import { AppNav } from '@summit/nav'
import { getIdentity, type AppRole } from '@summit/session'

export default function App({ Component, pageProps }: AppProps) {
  const [role, setRole] = React.useState<AppRole | null | undefined>(undefined)

  React.useEffect(() => {
    let cancelled = false
    getIdentity().then((identity) => {
      if (!cancelled) setRole(identity.appRole)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <AppNav activeKey="client" role={role} />
      <Component {...pageProps} />
    </>
  )
}
