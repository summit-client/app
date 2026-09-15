import '@summit/design/tokens.css'
import '@summit/design/components.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import PublicNav from '../components/PublicNav'

// /profile is this app's one authenticated screen - it renders the
// cross-portal AppNav itself (see pages/profile.tsx), not the marketing
// PublicNav every other page here gets.
const AUTHENTICATED_PATHS = new Set(['/profile'])

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isAuthenticated = AUTHENTICATED_PATHS.has(router.pathname)
  return (
    <>
      {!isAuthenticated && <PublicNav />}
      <Component {...pageProps} />
    </>
  )
}