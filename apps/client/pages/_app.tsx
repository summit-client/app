import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AppNav } from '@summit/nav'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <AppNav activeKey="client" />
      <Component {...pageProps} />
    </>
  )
}