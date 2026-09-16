import { ReactNode } from 'react'
import Head from 'next/head'

const display = "'Outfit',sans-serif"
const body = "'Source Sans 3',sans-serif"
const ink = '#0B2B31'
const g700 = '#3D5A6A'
const g500 = '#57748A'

/**
 * Shared shell for /privacy and /terms. Generic placeholder content, not
 * reviewed counsel - see each page's own note at the top of its body.
 */
export default function LegalPage({
  title, updated, children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <>
      <Head><title>{title} · Summit</title></Head>
      <main style={{ fontFamily: body, background: '#fff', minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px 80px' }}>
          <a href="/" style={{
            fontFamily: display, fontSize: '.85rem', fontWeight: 600,
            color: g500, textDecoration: 'none', display: 'inline-block', marginBottom: '2rem',
          }}>
            ← Back to summitclient.io
          </a>
          <h1 style={{
            fontFamily: display, fontSize: 'clamp(1.8rem,3.2vw,2.4rem)',
            letterSpacing: '-0.02em', fontWeight: 600, color: ink, marginBottom: '.5rem',
          }}>
            {title}
          </h1>
          <p style={{ color: g500, fontSize: '.85rem', marginBottom: '2.5rem' }}>
            Last updated {updated}
          </p>
          <div className="legal-body" style={{ color: g700, fontSize: '1rem', lineHeight: 1.75 }}>
            {children}
          </div>
        </div>
      </main>
    </>
  )
}
