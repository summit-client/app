import { useState } from 'react'

export default function PublicNav() {
  const [menuOpen, setMenuOpen] = useState(false)

  const links = [
    { label: 'Product', href: '/#product' },
    { label: 'About', href: '/about' },
    { label: 'Pricing', href: '/pricing' },
  ]

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#fff', borderBottom: '1px solid #e5e7eb',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>

        {/* Logo */}
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1A3F5C', letterSpacing: '-0.5px' }}>
            Summit Client
          </span>
        </a>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="desktop-nav">
          {links.map(l => (
            <a key={l.href} href={l.href} style={{
              fontSize: 15, fontWeight: 500, color: '#374151',
              textDecoration: 'none'
            }}>
              {l.label}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/clinician" style={{
            fontSize: 15, fontWeight: 600, color: '#fff',
            background: '#28B4A6', textDecoration: 'none',
            padding: '8px 16px', borderRadius: 6
          }}>
            Clinician portal
          </a>
          <a href="/login" style={{
            fontSize: 15, fontWeight: 500, color: '#1A3F5C',
            textDecoration: 'none', padding: '8px 16px'
          }}>
            Log in
          </a>
          <a href="/signup" style={{
            fontSize: 15, fontWeight: 600, color: '#fff',
            background: '#1A3F5C', textDecoration: 'none',
            padding: '8px 20px', borderRadius: 6
          }}>
            Get started
          </a>
        </div>
      </div>
    </nav>
  )
}