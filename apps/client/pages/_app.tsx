import '@summit/design/tokens.css'
import '@summit/design/components.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { AppNav } from '@summit/nav'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <AppNav activeKey="client" />
      <Component {...pageProps} />
    </>
  )
}