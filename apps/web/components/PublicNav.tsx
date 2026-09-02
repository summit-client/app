import { useEffect, useRef, useState } from 'react'

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Mobile menu behaviour: close on Escape (returning focus to the toggle),
  // close on an outside click, and close if the viewport is resized back up
  // past the desktop breakpoint (e.g. rotating a tablet) so the panel can't
  // get stuck open underneath the now-visible desktop links. All three only
  // need to run while the menu is actually open.
  useEffect(() => {
    if (!mobileOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return
      setMobileOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth > 780) setMobileOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [mobileOpen])

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

        {/* Logo lockup: the real Summit mark, then the wordmark.
            The supplied asset bakes "SUMMIT" under the peaks, which would set
            the word twice in a lockup, so the mark is cropped to the peaks and
            the wordmark is live text — it stays selectable, scales with the
            type system, and needs no second asset for a dark treatment.
            width/height are explicit so the nav does not shift as it loads. */}
        <a href="/" aria-label="SummitClient.io home"
           style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 9 }}>
          <img src="/summit-mark-64.png" alt="" width={28} height={28}
               style={{ display: 'block', flexShrink: 0 }} />
          <span style={{
            fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 600,
            color: '#0B2B31', letterSpacing: '-0.02em', whiteSpace: 'nowrap',
          }}>
            SummitClient<span style={{ color: '#5A787C', fontWeight: 500 }}>.io</span>
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

        {/* CTAs + mobile menu toggle. The toggle sits with the CTAs rather
            than beside the logo so it lands on the same side a thumb already
            is on a phone; it's CSS-hidden above 780px (see .mobile-nav-toggle
            in globals.css) so it never appears alongside the desktop links. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/login" className="pubnav-login" style={{
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
          <button
            ref={toggleRef}
            type="button"
            className="mobile-nav-toggle"
            aria-expanded={mobileOpen}
            aria-controls="pubnav-mobile-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen(open => !open)}
          >
            {mobileOpen ? (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path d="M4 4L18 18M18 4L4 18" stroke="#1A3F5C" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path d="M3 6H19M3 11H19M3 16H19" stroke="#1A3F5C" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel. Only mounted while open, so a closed menu's
          links are genuinely out of the tab order rather than merely hidden
          with CSS — no separate aria-hidden/inert bookkeeping needed. */}
      {mobileOpen && (
        <div
          id="pubnav-mobile-menu"
          ref={panelRef}
          className="mobile-nav-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Site menu"
        >
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              className="mobile-nav-link"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  )
}
