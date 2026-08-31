import { useEffect, useState, useRef, ReactNode } from 'react'
import { motion, useScroll, useSpring, useTransform, useMotionValue, MotionValue } from 'motion/react'

type Cell = { type: string; lines: string[] } | null

const ROWS: { time: string; cells: Cell[] }[] = [
  { time: '9:00 AM', cells: [
    { type: 'teal', lines: ['Direct Therapy','J. Martinez'] }, null,
    { type: 'blue', lines: ['Assessment','R. Patel'] }, null,
    { type: 'teal', lines: ['Direct Therapy','M. Chen'] }, null,
  ]},
  { time: '10:00 AM', cells: [
    null, { type: 'yellow', lines: ['Group Therapy','3 clients'] }, null,
    { type: 'teal', lines: ['Direct Therapy','A. Williams'] }, null, null,
  ]},
  { time: '11:00 AM', cells: [
    { type: 'blue', lines: ['Supervision','Dr. K. Park'] }, null,
    { type: 'teal', lines: ['Direct Therapy','L. Torres'] }, null,
    { type: 'blue', lines: ['Assessment','B. Nguyen'] }, null,
  ]},
]

// Assign each filled cell a global sequence number so the highlight
// sweep runs left-to-right, top-to-bottom across the whole grid.
let _seq = 0
const SEQ_ROWS = ROWS.map(row => ({
  ...row,
  cells: row.cells.map(cell => (cell ? { ...cell, seq: _seq++ } : null)),
}))
const SEQ_TOTAL = _seq

// ── Scene timing ──────────────────────────────────────────────
// Pills: staggered entrance, then each draws a connector.
const PILL_COUNT   = 3      // keep in sync with PILLS below
const PILL_START   = 0.28
const PILL_STAGGER = 0.13
const PILL_DUR     = 0.14
const LINE_DUR     = 0.09

// Moment the final connector finishes drawing.
const SCENE_PEAK = PILL_START + (PILL_COUNT - 1) * PILL_STAGGER + PILL_DUR + LINE_DUR

// Cell highlight sweep runs from SWEEP_START and lands its last cell
// exactly on SCENE_PEAK, so the grid finishes as the last line completes.
const SWEEP_START = 0.18
const CELL_DUR    = 0.07
const SWEEP_SPAN  = SCENE_PEAK - SWEEP_START - CELL_DUR

export default function Home() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      window.location.replace('/auth/callback' + window.location.hash)
    }
  }, [])

  // Scroll-triggered reveal for anything with class="reveal"
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Count-up for the hero's portal-count stat. Previously it counted to 2 for
  // a "2x faster scheduling" claim; it counts to 5 now, which is the number of
  // portals that actually exist (web, scheduler, data, client, employee) rather
  // than a speed multiple nobody measured.
  const [portalCount, setPortalCount] = useState(0)
  useEffect(() => {
    const duration = 900
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setPortalCount(Math.round(progress * 5))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Brand colours — Summit palette
  const grad  = 'linear-gradient(135deg,#28B4A6 0%,#21798A 55%,#1A3F5C 100%)'
  const navy  = '#1A3F5C'
  // Darkened from the brand's #28B4A6/#7A9AAD for text use only - both failed
  // WCAG AA (2.57:1 and 2.98:1 on white) at the small sizes they're set in
  // here. Decorative uses of the brand teal (icon fills, gradients, the
  // SessionCell mockup) stay on the literal hex elsewhere in this file.
  const teal  = '#1C7A70'
  const g100  = '#EEF3F6'
  const g500  = '#57748A'
  const g700  = '#3D5A6A'
  const off   = '#F7FAFB'
  const display = "'Bricolage Grotesque',sans-serif"
  const body    = "'Hanken Grotesk',sans-serif"

  // This hero is a pinned-scroll ("scrollytelling") sequence: a 320vh-tall
  // container holds the viewport via position:sticky while scrollYProgress
  // drives pills flying in, a calendar 3D-rotating, and cells sweeping a
  // highlight in choreographed order - all tuned around that long, slow
  // scroll distance. Compressing that same choreography onto a phone's
  // natural (short, unpinned) scroll would either flash by unreadably or,
  // if left pinned, clip a stacked single-column layout inside the fixed
  // `calc(100vh - 64px)` sticky viewport. Neither is fixable by changing a
  // few values - so below the breakpoint this renders a plain, static,
  // unpinned stack instead, same pattern used for this kind of effect
  // everywhere else (Apple/Stripe-style pages do the same on mobile).
  //
  // The mobile/desktop split itself lives entirely in CSS now
  // (`.hero-bg`/`.hero-sticky`/`.hero-grid`/`.hero-pills` in globals.css) -
  // `staticScene` below only ever chooses which *scroll-linked motion
  // values* apply on top of that already-correct layout, never layout
  // itself. It used to also pick `height: '320vh'` vs `'auto'` inline
  // directly: since that same state started `false` (to match the
  // server-rendered HTML) and only flipped after a `matchMedia` check ran in
  // a `useEffect` a tick after hydration, a phone visibly rendered the
  // desktop pinned-scroll layout for one frame and then collapsed to the
  // real mobile stack. Confirmed live: hero height dropped from 2700px to
  // 1039px within ~100ms of load on a 390px viewport.
  //
  // Now that layout no longer depends on this flag, it's tempting to read
  // `matchMedia` synchronously in the initial state to close the flip
  // window entirely - don't: that makes the *first client render* disagree
  // with the server-rendered HTML (server always computes `false`, having
  // no `window`), which is a real hydration mismatch, not a cosmetic one -
  // React logs it and discards/regenerates the whole subtree on the client.
  // Starting `false` and flipping in an effect keeps the initial client
  // render identical to the server's, so hydration succeeds cleanly; since
  // every motion value this flag gates is already at its scroll-position-0
  // resting state on load (opacity 1, rotate 0, pills' translateX un-flown),
  // the later flip changes nothing visible unless the user has already
  // scrolled - by which point it has long since settled the same way the
  // original `isMobile` flip did. `prefers-reduced-motion` is folded into
  // the same flag so a reduced-motion user gets the settled state too,
  // matching every CSS animation's own reduced-motion rule below.
  const [staticScene, setStaticScene] = useState(false)
  useEffect(() => {
    const mqMobile = window.matchMedia('(max-width: 780px)')
    const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setStaticScene(mqMobile.matches || mqReduced.matches)
    onChange()
    mqMobile.addEventListener('change', onChange)
    mqReduced.addEventListener('change', onChange)
    return () => {
      mqMobile.removeEventListener('change', onChange)
      mqReduced.removeEventListener('change', onChange)
    }
  }, [])
  // A settled (never-animating) progress value for SessionCell/pills math
  // when staticScene - clamped past every threshold, so it reads as "finished".
  const staticProgress = useMotionValue(1)

  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end end'] })
  const cellProgress = staticScene ? staticProgress : scrollYProgress

  // Springed copy drives the heavy calendar rotation so it carries weight
  // and smooths trackpad jitter. Pills stay on the raw value to feel snappy.
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 22, restDelta: 0.001 })

  const rotateY = useTransform(smooth, [0.18, 0.85], [0, -32])
  const rotateX = useTransform(smooth, [0.18, 0.85], [0, 10])
  const calScale = useTransform(smooth, [0.18, 0.85], [1, 0.95])
  const badgeOpacity = useTransform(scrollYProgress, [0.10, 0.18], [1, 0])
  const sceneOpacity = useTransform(scrollYProgress, [0.88, 1], [1, 0])

  // Three pills, one per portal the platform actually gives someone, rather
  // than three scheduler features. PILL_COUNT above must stay at 3.
  //
  // The privacy pill previously read "HIPAA-ready". HIPAA is a US regime and
  // does not bind this product: the anchor client is Canadian, so PHIPA
  // (Ontario) and PIPEDA (federal) are what apply. See CLAUDE.md. Claiming the
  // wrong regime on a public page is the kind of thing a buyer's compliance
  // reviewer reads as not knowing which rules you are under.
  const PILLS = [
    { glyph: '🗓️', title: 'Schedule and deliver', sub: 'Matched, booked, recorded in the app' },
    { glyph: '📈', title: 'Data to reports',      sub: 'Graphs and notes from what was recorded' },
    { glyph: '🔒', title: 'PHIPA and PIPEDA',     sub: 'Per clinic access control throughout' },
  ]

  return (
    <>

{/* ── HERO / SCROLL SCENE ── */}
      <div ref={heroRef} className="hero-bg" style={{
        background: 'linear-gradient(180deg,#EDF6F9 0%,#fff 100%)',
      }}>
        <motion.div className="hero-sticky" style={{
          opacity: staticScene ? 1 : sceneOpacity,
          fontFamily: body,
        }}>
          <div className="hero-grid">

            {/* Left: copy fades out, pills fly in.
                COPY BAND holds badge/headline/paragraph and defines the region.
                Pills are top-anchored inside it, so they physically cannot
                reach the CTA, which sits after the band in normal flow. */}
            <div style={{ position: 'relative' }}>

              <div style={{ position: 'relative' }}>
                <FadeOut progress={scrollYProgress} start={0.10} active={!staticScene}>
                  <div className="an1" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                    background: 'rgba(40,180,166,.12)', color: teal,
                    fontSize: '.78rem', fontWeight: 700,
                    padding: '.35rem .8rem', borderRadius: 100,
                    marginBottom: '1.25rem',
                    fontFamily: display, letterSpacing: '.02em',
                  }}>
                    ✦ Built for ABA Clinics
                  </div>
                </FadeOut>

                <FadeOut progress={scrollYProgress} start={0.13} active={!staticScene}>
                  <h1 className="an2" style={{
                    fontFamily: display,
                    fontSize: 'clamp(2.1rem,3.8vw,3.1rem)',
                    fontWeight: 800, lineHeight: 1.15,
                    color: navy, marginBottom: '1.25rem',
                  }}>
                    Run the whole clinic,<br />
                    not just{' '}
                    <span className="grad-text">the calendar.</span>
                  </h1>
                </FadeOut>

                <FadeOut progress={scrollYProgress} start={0.16} active={!staticScene}>
                  <p className="an3" style={{
                    fontSize: '1.05rem', color: g700,
                    marginBottom: '2rem', maxWidth: 460, lineHeight: 1.75,
                  }}>
                    Scheduling, session data, assessments, reports, the family portal, credentials and payroll, all on one record. Book a session and everything downstream follows from it.
                  </p>
                </FadeOut>

                {/* Pills — top-anchored to the band, height is intrinsic.
                    They fly in on top of the copy above as it fades out, so
                    on mobile (copy never fades - see FadeOut active={false}
                    above) they'd just sit permanently on top of it. Hidden
                    via CSS (.hero-pills) rather than left unmounted, so
                    there's no conditional-render flash to match either;
                    Features further down the page covers the same three
                    claims as plain, static content. */}
                <div className="hero-pills" aria-hidden="true">
                  {PILLS.map((p, i) => (
                    <FeaturePill key={p.title} progress={scrollYProgress} index={i} {...p} />
                  ))}
                </div>
              </div>

              <div className="an4" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2.5rem' }}>
                <a href="/signup" className="btn-primary" style={{
                  background: grad, color: '#fff',
                  fontFamily: display, fontSize: '1rem', fontWeight: 700,
                  padding: '.875rem 2rem', borderRadius: 10,
                  boxShadow: '0 4px 22px rgba(26,63,92,.28)',
                  display: 'inline-block', position: 'relative', zIndex: 3,
                }}>
                  Start Free Trial
                </a>
                <FadeOut progress={scrollYProgress} start={0.19} active={!staticScene}>
                  <a href="#how" style={{
                    color: navy,
                    fontFamily: display, fontSize: '1rem', fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                  }}>
                    See how it works →
                  </a>
                </FadeOut>
              </div>

              <FadeOut progress={scrollYProgress} start={0.22} active={!staticScene}>
                <div className="an5" style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                  {/* One stat per part of the platform, not three about the
                      calendar. "1" is the actual claim being made: the session
                      is recorded once and the note, the graph, the family
                      statement and the timesheet all come from that record. */}
                  {[['1','record, end to end'],['','portals, one login'],['0','double entry']].map(([v,l], i) => (
                    <div key={l}>
                      <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 800, color: navy }}>
                        {i === 1 ? portalCount : v}
                      </div>
                      <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </FadeOut>
            </div>

            {/* Right: calendar rotates in place (desktop only - flat and
                static on mobile, see the staticScene note above heroRef).
                Purely illustrative - hidden from assistive tech so a screen
                reader doesn't read out a fake week of mock session names. */}
            <motion.div aria-hidden="true" style={{
              rotateX: staticScene ? 0 : rotateX,
              rotateY: staticScene ? 0 : rotateY,
              scale: staticScene ? 1 : calScale,
              position: 'relative', transformStyle: staticScene ? undefined : 'preserve-3d',
              willChange: 'transform',
            }}>
              <div style={{
                background: '#fff', borderRadius: 16,
                boxShadow: '0 24px 64px rgba(26,63,92,.14),0 4px 16px rgba(26,63,92,.07)',
                overflow: 'hidden', border: `1px solid ${g100}`,
              }}>
                <div style={{ background: '#0F2E3D', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {['#ff5f57','#ffbd2e','#28c840'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                  <div style={{ margin: '0 auto', color: 'rgba(255,255,255,.6)', fontSize: '.72rem', fontFamily: display }}>
                    Summit Scheduler — Week of May 26
                  </div>
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6,1fr)', gap: 3, marginBottom: 3 }}>
                    <div />
                    {['Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                      <div key={d} style={{
                        fontFamily: display, fontSize: '.68rem',
                        fontWeight: 600, color: g500, textAlign: 'center', padding: '5px 0',
                      }}>{d}</div>
                    ))}
                  </div>

                  {SEQ_ROWS.map((row, ri) => (
                    <div key={row.time}>
                      {ri > 0 && <div style={{ height: 3 }} />}
                      <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6,1fr)', gap: 3 }}>
                        <div style={{ fontSize: '.65rem', color: g500, textAlign: 'right', paddingRight: 7, paddingTop: 3 }}>
                          {row.time}
                        </div>
                        {row.cells.map((cell, ci) => cell ? (
                          <SessionCell
                            key={ci}
                            progress={cellProgress}
                            seq={cell.seq}
                            type={cell.type}
                            lines={cell.lines}
                          />
                        ) : (
                          <div key={ci} style={{ height: 62, borderRadius: 4, background: g100 }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <motion.div className="float-badge" style={{
                opacity: staticScene ? 1 : badgeOpacity,
                position: 'absolute', bottom: -18, right: 20,
                background: '#fff', borderRadius: 12, padding: '11px 15px',
                boxShadow: '0 8px 32px rgba(26,63,92,.14)',
                border: `1px solid ${g100}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: grad, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '1rem',
                }}>✓</div>
                <div>
                  <div style={{ fontFamily: display, fontSize: '.78rem', fontWeight: 700, color: navy }}>12 sessions booked</div>
                  <div style={{ fontSize: '.68rem', color: g500 }}>Conflicts resolved automatically</div>
                </div>
              </motion.div>
            </motion.div>

          </div>
        </motion.div>
      </div>

      {/* ── LOGOS MARQUEE ── */}
      <div style={{
        padding: '28px 0',
        borderTop: `1px solid ${g100}`,
        borderBottom: `1px solid ${g100}`,
        fontFamily: body,
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto 1.1rem', textAlign: 'center', padding: '0 2rem' }}>
          <div style={{
            fontSize: '.75rem', color: g500, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.09em',
          }}>
            Trusted by growing ABA clinics across North America
          </div>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {[...Array(2)].flatMap(() =>
              ['Beacon ABA','Clarity Clinic','Pathways','Summit Therapy','Bright Futures ABA','Maple Grove ABA','Harbourview Clinic']
            ).map((name, i) => (
              <span key={i} style={{
                fontFamily: display, fontSize: '.95rem',
                fontWeight: 700, color: '#C4D3DC', letterSpacing: '-.01em',
                padding: '0 1.5rem', whiteSpace: 'nowrap',
              }}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="landing-section" style={{ background: '#fff', fontFamily: body }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>Features</div>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            fontWeight: 800, color: navy, marginBottom: '.9rem', maxWidth: 580,
          }}>
            One platform, from the first booking to the last payroll line
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            Most of this is work that usually takes three or four separate systems, plus the reconciliation between them.
          </p>
          <div className="grid-3" style={{ display: 'grid', gap: '1.25rem' }}>
            {[
              { icon: '🗓️', title: 'Scheduling that matches',      desc: 'Matches each client to qualified, available staff and builds the recurring calendar, with conflict detection as you drag. Across every site you run.' },
              { icon: '📝', title: 'Session data as it happens',  desc: 'Run the session in the app and record observations as they occur. Graphs and mastery are derived from that data, never typed in a second time.' },
              { icon: '📈', title: 'Assessments and reports',     desc: 'ABLLS-R, AFLS, ADL and MOTAS scored in place. Reports are built from the evidence actually recorded, and a clinician signs every one.' },
              { icon: '👪', title: 'A portal families use',       desc: 'Upcoming sessions, progress, signed notes, and a funding statement that reconciles: total budget, spent to date, and every charge behind it.' },
              { icon: '🎓', title: 'Credentials and training',    desc: 'Onboarding, training records and certificates, with CEU tracking across BACB, CPBAO and IBA that counts one course toward each without inflating the total.' },
              { icon: '🔒', title: 'Time, pay and privacy',       desc: 'Delivered sessions become hours and charges on their own, with overtime worked out over the declared work week as the ESA requires. Built for PHIPA and PIPEDA, with per clinic access control throughout.' },
            ].map((f, i) => (
              <div key={f.title} className="feature-card reveal" style={{
                background: off, borderRadius: 16,
                padding: '1.75rem', border: `1px solid ${g100}`,
                transitionDelay: `${(i % 3) * 90}ms`,
              }}>
                <div aria-hidden="true" style={{
                  width: 46, height: 46, borderRadius: 12, background: grad,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.1rem', fontSize: '1.25rem',
                }}>{f.icon}</div>
                <h3 style={{ fontFamily: display, fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{f.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="landing-section" style={{ background: off, fontFamily: body }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>How it works</div>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            fontWeight: 800, color: navy, marginBottom: '.9rem', maxWidth: 580,
          }}>
            Record it once. Everything downstream follows.
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            The pieces fit because they are the same record, not four systems reconciled at month end.
          </p>
          <div className="grid-3" style={{ display: 'grid', gap: '2rem' }}>
            {[
              { n: '1', title: 'Set the clinic up once',   desc: 'Clients, staff, sites, services and funding. Everything after this reads from it, so the same fact is never entered twice.' },
              { n: '2', title: 'Deliver and record',       desc: 'Book the session, run it in the app, record what happened. That one act is the source for the note, the graph and the hours.' },
              { n: '3', title: 'The rest follows',         desc: 'The family sees progress and a statement that adds up. The clinician has hours on a timesheet. The charge sits on the budget. Nobody re-keyed any of it.' },
            ].map((s, i) => (
              <div key={s.n} className="reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', transitionDelay: `${i * 120}ms` }}>
                <div style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: grad, color: '#fff',
                  fontFamily: display, fontSize: '1.2rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.2rem',
                  boxShadow: '0 4px 18px rgba(26,63,92,.28)',
                }}>{s.n}</div>
                <h3 style={{ fontFamily: display, fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{s.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section id="testimonials" className="testi-bg landing-section" style={{
        background: '#0F2E3D',
        position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ maxWidth: 780, margin: '0 auto', textAlign: 'center' }}>
          <blockquote style={{
            fontFamily: display,
            fontSize: 'clamp(1.25rem,2.2vw,1.7rem)',
            fontWeight: 600, color: '#fff', lineHeight: 1.55, marginBottom: '2rem',
          }}>
            &ldquo;We used to spend 4 hours a week building the schedule. With Summit, it&rsquo;s done in 20 minutes — and there are zero double bookings.&rdquo;
          </blockquote>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: grad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: display, fontWeight: 700, color: '#fff', fontSize: '.95rem',
            }}>SC</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: display, fontWeight: 700, color: '#fff', fontSize: '.9rem' }}>Sarah Chen, BCBA-D</div>
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)' }}>Clinical Director, Clarity ABA Clinic</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="trial" className="landing-section-lg" style={{
        background: grad,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(2rem,3.8vw,2.9rem)',
            fontWeight: 800, color: '#fff', marginBottom: '1rem', lineHeight: 1.2,
          }}>
            Ready to take your scheduling to the summit?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '1.05rem', marginBottom: '2.5rem' }}>
            Start your free trial today. Set up in under 10 minutes.
          </p>
          <a href="/signup" className="btn-primary" style={{
            background: '#fff', color: navy,
            fontFamily: display, fontSize: '1rem', fontWeight: 700,
            padding: '.9rem 2.25rem', borderRadius: 10,
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0,0,0,.14)',
          }}>
            Start Free Trial →
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#0F2E3D', padding: '36px 2rem',
        borderTop: '1px solid rgba(255,255,255,.05)',
        fontFamily: body,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <span style={{
            fontFamily: display, fontWeight: 800,
            color: 'rgba(255,255,255,.6)', fontSize: '1rem', letterSpacing: '-.01em',
          }}>SUMMIT</span>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {([
              ['Features','#features'],
              ['How it works','#how'],
              ['Reviews','#testimonials'],
              ['Contact','mailto:yanko@summitclient.io'],
              ['Privacy','/privacy'],
              ['Terms','/terms'],
            ] as [string,string][]).map(([label,href]) => (
              <a key={href} href={href} style={{ color: 'rgba(255,255,255,.55)', fontSize: '.82rem' }}>{label}</a>
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,.52)', fontSize: '.78rem' }}>© 2026 Summit Client Inc.</span>
        </div>
      </footer>
    </>
  )
}

function FadeOut({ progress, start, active = true, children }: {
  progress: MotionValue<number>; start: number; active?: boolean; children: ReactNode
}) {
  // Hooks run unconditionally either way; only the branch below differs, so
  // this stays legal regardless of what `active` is on a given render.
  const opacity = useTransform(progress, [start, start + 0.10], [1, 0])
  const y = useTransform(progress, [start, start + 0.10], [0, -36])
  if (!active) return <>{children}</>
  return <motion.div style={{ opacity, y, willChange: 'transform, opacity' }}>{children}</motion.div>
}

function FeaturePill({ progress, index, glyph, title, sub }: {
  progress: MotionValue<number>; index: number; glyph: string; title: string; sub: string
}) {
  const start = PILL_START + index * PILL_STAGGER
  const end = start + PILL_DUR

  const x = useTransform(progress, [start, end], [420, 0])
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1])
  const scale = useTransform(progress, [start, end], [0.55, 1])
  // Counter-rotation: pill arrives turned away, squares up as it lands.
  const rotateY = useTransform(progress, [start, end], [-26, 0])
  const z = useTransform(progress, [start, end], [140, 60])

  // Connector draws only once the pill has settled.
  const lineLength = useTransform(progress, [end, end + LINE_DUR], [0, 1])
  const lineOpacity = useTransform(progress, [end, end + 0.04, 0.86, 0.9], [0, 1, 1, 0])

  return (
    <motion.div style={{
      x, opacity, scale, rotateY, z,
      position: 'relative',
      transformStyle: 'preserve-3d',
      willChange: 'transform, opacity',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.85rem',
        background: '#fff', border: '1px solid #EEF3F6',
        borderRadius: 999, padding: '.75rem 1.35rem .75rem .75rem',
        boxShadow: '0 10px 34px rgba(26,63,92,.12)',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: 'linear-gradient(135deg,#28B4A6 0%,#21798A 55%,#1A3F5C 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem',
        }}>{glyph}</div>
        <div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: '.95rem', fontWeight: 700, color: '#1A3F5C' }}>{title}</div>
          <div style={{ fontSize: '.75rem', color: '#7A9AAD' }}>{sub}</div>
        </div>
      </div>

      {/* Connector line running from pill toward the calendar */}
      <svg
        width="52" height="10" viewBox="0 0 52 10"
        style={{ position: 'absolute', left: '100%', top: '50%', marginTop: -5, overflow: 'visible' }}
      >
        <motion.path
          d="M0 5 L44 5"
          stroke="#28B4A6" strokeWidth="2" strokeLinecap="round" fill="none"
          style={{ pathLength: lineLength, opacity: lineOpacity }}
        />
        <motion.circle
          cx="48" cy="5" r="3.5" fill="#28B4A6"
          style={{ opacity: lineOpacity, scale: lineLength, transformOrigin: '48px 5px' }}
        />
      </svg>
    </motion.div>
  )
}

function SessionCell({ progress, seq, type, lines }: {
  progress: MotionValue<number>; seq: number; type: string; lines: string[]
}) {
  // Sweep lands its last cell exactly when the third connector completes.
  const denom = Math.max(SEQ_TOTAL - 1, 1)
  const start = SWEEP_START + (seq / denom) * SWEEP_SPAN
  const mid = start + CELL_DUR / 2
  const end = start + CELL_DUR

  const scale = useTransform(progress, [start, mid, end], [1, 1.09, 1])
  const glow = useTransform(progress, [start, mid, end], [0, 1, 0])

  const bg =
    type === 'teal' ? 'linear-gradient(135deg,#28B4A6,#219A8E)' :
    type === 'blue' ? 'linear-gradient(135deg,#21798A,#1D6478)' :
                      'linear-gradient(135deg,#e09c00,#c98d00)'

  return (
    <motion.div style={{
      scale,
      position: 'relative', height: 62, borderRadius: 6,
      willChange: 'transform',
    }}>
      <div style={{
        height: '100%', borderRadius: 6, padding: '3px 5px',
        fontSize: '.6rem', fontWeight: 700, color: '#fff',
        fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1.3,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
        background: bg,
      }}>
        {lines.map(t => <span key={t}>{t}</span>)}
      </div>
      <motion.div style={{
        opacity: glow,
        position: 'absolute', inset: 0, borderRadius: 6,
        boxShadow: '0 0 0 3px rgba(40,180,166,.55), 0 10px 26px rgba(40,180,166,.40)',
        pointerEvents: 'none',
      }} />
    </motion.div>
  )
}
