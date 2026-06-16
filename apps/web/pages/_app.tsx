import type { AppProps } from 'next/app'
import { AuthProvider } from '../context/AuthProvider'
import PublicNav from '../components/PublicNav'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <PublicNav />
      <Component {...pageProps} />
    </AuthProvider>
  )
}