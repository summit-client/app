import type { AppProps } from 'next/app'
import { AuthProvider } from '../context/AuthProvider'
import Navbar from '../components/Navbar'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Navbar />
      <Component {...pageProps} />
    </AuthProvider>
  )
}