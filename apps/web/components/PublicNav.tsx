import { useEffect, useState } from 'react'

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'Features', href: '/#features' },
    { label: 'How it works', href: '/#how' },
    { label: 'Reviews', href: '/#testimonials' },
  ]

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(255,255,255,.95)' : '#fff',
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: '1px solid #e5e7eb',
      boxShadow: scrolled ? '0 4px 20px rgba(26,63,92,.08)' : 'none',
      transition: 'box-shadow .25s ease, background .25s ease',
      fontFamily: "'Source Sans 3',sans-serif"
    }}>
      <div className="pubnav-inner" style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>

        {/* Logo */}
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 600, color: '#0B2B31', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            Summit Client
          </span>
        </a>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="desktop-nav">
          {links.map(l => (
            <a key={l.href} href={l.href} className="nav-link-item" style={{
              fontSize: 15, fontWeight: 500, color: '#3D5A6A',
              textDecoration: 'none'
            }}>
              {l.label}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/login" style={{
            fontFamily: "'Outfit',sans-serif",
            fontSize: 15, fontWeight: 500, color: '#1A3F5C',
            textDecoration: 'none', padding: '8px 16px', whiteSpace: 'nowrap'
          }}>
            Log in
          </a>
          <a href="/signup" className="btn-primary" style={{
            fontFamily: "'Outfit',sans-serif",
            fontSize: 15, fontWeight: 600, color: '#fff',
            background: '#0C5350',
            textDecoration: 'none',
            padding: '8px 20px', borderRadius: 6
          }}>
            Get started
          </a>
        </div>
      </div>
    </nav>
  )
}
