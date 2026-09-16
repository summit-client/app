import '@summit/design/tokens.css'
import '@summit/design/components.css'
import type { AppProps } from 'next/app'
import '../styles/globals.css'
import PublicNav from '../components/PublicNav'

// apps/web is marketing and sign-in only - it has no authenticated screen of
// its own (see @summit/portals' profileUrl(): every role's real profile
// lives in apps/employee or apps/client). Every page here gets the same
// public nav.
export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <PublicNav />
      <Component {...pageProps} />
    </>
  )
}