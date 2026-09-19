import { useEffect, useRef, useState } from 'react'

const MENU_ID = 'pubnav-toggle'

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false)
  const toggleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Escape closes the menu. This is the ONLY JavaScript the menu has, and it
  // is an enhancement rather than the mechanism - the open/close state is a
  // checkbox, so everything below still works with scripting dead.
  //
  // It used to be React state, and that was the bug: on a phone the header's
  // own "Log in" link is display:none (see .pubnav-login in globals.css), so
  // the dropdown was the only route to signing in - and the dropdown did not
  // exist in the DOM until a click handler ran. Before hydration finished, or
  // permanently if it failed, tapping the hamburger did nothing and a visitor
  // had no way into the product at all. Verified by loading this page with
  // JavaScript disabled: the toggle rendered, the panel never mounted.
  //
  // Tap-outside-to-close is the backdrop label; the resize case is the media
  // query. Neither needs a listener any more.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const box = toggleRef.current
      if (!box?.checked) return
      box.checked = false
      box.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const links = [
    { label: 'Features', href: '/#features' },
    { label: 'How it works', href: '/#how' },
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
      {/* First child of <nav> on purpose: every rule below reaches the
          backdrop and the panel with a `~` sibling selector, which only works
          forwards from here. */}
      <input
        ref={toggleRef}
        type="checkbox"
        id={MENU_ID}
        className="pubnav-toggle-input"
        aria-label="Site menu"
      />

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
          {/* Both icons are always in the DOM and CSS swaps them on the
              checkbox's state - a JS-driven ternary would have put us back
              where we started. The label is the thing a thumb hits; the
              checkbox itself is the focusable control, sitting invisible
              above with pointer-events off, exactly as
              packages/design/components.css does it for the in-app sidebars. */}
          <label htmlFor={MENU_ID} className="mobile-nav-toggle">
            <svg className="mobile-nav-icon-open" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M3 6H19M3 11H19M3 16H19" stroke="#1A3F5C" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <svg className="mobile-nav-icon-close" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M4 4L18 18M18 4L4 18" stroke="#1A3F5C" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </label>
        </div>
      </div>

      {/* Tap anywhere off the panel to close. A label, not a listener, so it
          works without scripting like the rest of this. */}
      <label htmlFor={MENU_ID} className="mobile-nav-backdrop" aria-hidden="true" />

      {/* Always in the DOM now, shown by CSS. `display: none` when closed
          keeps these links out of the tab order and the accessibility tree
          just as unmounting did, so nothing is lost by the change. */}
      <div className="mobile-nav-panel" aria-label="Site menu">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              className="mobile-nav-link"
            >
              {l.label}
            </a>
          ))}
          {/* .pubnav-login (the header's own "Log in" link) is display:none
              below 780px - genuinely gone from layout, the accessibility
              tree and the tab order, not just visually hidden - so without
              this, a phone visitor had no way to reach /login at all short
              of typing the URL or going via /signup's "Already have an
              account?" link. Confirmed live by rendering the mobile menu:
              the comment on .pubnav-login in globals.css claims the dropdown
              already carries "a path to sign in" - it didn't. */}
          <a href="/login" className="mobile-nav-link">
            Log in
          </a>
      </div>
    </nav>
  )
}
