import type { AppProps } from 'next/app'
import '../styles/globals.css'
import PublicNav from '../components/PublicNav'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <PublicNav />
      <Component {...pageProps} />
    </>
  )
}