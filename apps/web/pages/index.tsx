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

  // Simple count-up for the hero "2x faster" stat
  const [multiplier, setMultiplier] = useState(0)
  useEffect(() => {
    const duration = 900
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setMultiplier(Math.round(progress * 2 * 10) / 10)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Brand colours — Summit palette
  const grad  = 'linear-gradient(135deg,#28B4A6 0%,#21798A 55%,#1A3F5C 100%)'
  const navy  = '#1A3F5C'
  const teal  = '#28B4A6'
  const g100  = '#EEF3F6'
  const g500  = '#7A9AAD'
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
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 780px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // A settled (never-animating) progress value for SessionCell/pills math
  // when isMobile - clamped past every threshold, so it reads as "finished".
  const staticProgress = useMotionValue(1)

  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end end'] })
  const cellProgress = isMobile ? staticProgress : scrollYProgress

  // Springed copy drives the heavy calendar rotation so it carries weight
  // and smooths trackpad jitter. Pills stay on the raw value to feel snappy.
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 22, restDelta: 0.001 })

  const rotateY = useTransform(smooth, [0.18, 0.85], [0, -32])
  const rotateX = useTransform(smooth, [0.18, 0.85], [0, 10])
  const calScale = useTransform(smooth, [0.18, 0.85], [1, 0.95])
  const badgeOpacity = useTransform(scrollYProgress, [0.10, 0.18], [1, 0])
  const sceneOpacity = useTransform(scrollYProgress, [0.88, 1], [1, 0])

  const PILLS = [
    { glyph: '🤖', title: 'AI staff matching',    sub: 'Best-qualified and available, instantly' },
    { glyph: '📅', title: 'Recurring schedules',  sub: 'Set once, built in bulk' },
    { glyph: '🔒', title: 'HIPAA-ready',          sub: 'Encrypted, role-based access' },
  ]

  return (
    <>

{/* ── HERO / SCROLL SCENE ── */}
      <div ref={heroRef} style={{
        position: 'relative', height: isMobile ? 'auto' : '320vh',
        background: 'linear-gradient(180deg,#EDF6F9 0%,#fff 100%)',
      }}>
        <motion.div style={{
          opacity: isMobile ? 1 : sceneOpacity,
          position: isMobile ? 'static' : 'sticky', top: 64,
          height: isMobile ? 'auto' : 'calc(100vh - 64px)',
          display: 'flex', alignItems: 'center',
          overflow: isMobile ? 'visible' : 'hidden',
          padding: isMobile ? '96px 1.25rem 2.5rem' : '0 2rem',
          fontFamily: body,
        }}>
          <div style={{
            maxWidth: 1200, margin: '0 auto', width: '100%',
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: isMobile ? '2.5rem' : '4rem', alignItems: 'center',
            perspective: isMobile ? undefined : 1500,
          }}>

            {/* Left: copy fades out, pills fly in.
                COPY BAND holds badge/headline/paragraph and defines the region.
                Pills are top-anchored inside it, so they physically cannot
                reach the CTA, which sits after the band in normal flow. */}
            <div style={{ position: 'relative' }}>

              <div style={{ position: 'relative' }}>
                <FadeOut progress={scrollYProgress} start={0.10} active={!isMobile}>
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

                <FadeOut progress={scrollYProgress} start={0.13} active={!isMobile}>
                  <h1 className="an2" style={{
                    fontFamily: display,
                    fontSize: 'clamp(2.1rem,3.8vw,3.1rem)',
                    fontWeight: 800, lineHeight: 1.15,
                    color: navy, marginBottom: '1.25rem',
                  }}>
                    Scheduling that works<br />
                    as hard as{' '}
                    <span className="grad-text">your clinicians do.</span>
                  </h1>
                </FadeOut>

                <FadeOut progress={scrollYProgress} start={0.16} active={!isMobile}>
                  <p className="an3" style={{
                    fontSize: '1.05rem', color: g700,
                    marginBottom: '2rem', maxWidth: 460, lineHeight: 1.75,
                  }}>
                    Summit matches clients to the right staff automatically, eliminates double bookings, and builds your entire recurring schedule in minutes, not hours.
                  </p>
                </FadeOut>

                {/* Pills — top-anchored to the band, height is intrinsic.
                    They fly in on top of the copy above as it fades out, so
                    on mobile (copy never fades - see FadeOut active={false}
                    above) they'd just sit permanently on top of it. Skipped
                    entirely there; Features further down the page covers the
                    same three claims as plain, static content. */}
                {!isMobile ? (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: 0,
                    display: 'flex', flexDirection: 'column',
                    gap: '1.1rem',
                    pointerEvents: 'none', zIndex: 2,
                    perspective: 1200, transformStyle: 'preserve-3d',
                  }}>
                    {PILLS.map((p, i) => (
                      <FeaturePill key={p.title} progress={scrollYProgress} index={i} {...p} />
                    ))}
                  </div>
                ) : null}
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
                <FadeOut progress={scrollYProgress} start={0.19} active={!isMobile}>
                  <a href="#how" style={{
                    color: navy,
                    fontFamily: display, fontSize: '1rem', fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                  }}>
                    See how it works →
                  </a>
                </FadeOut>
              </div>

              <FadeOut progress={scrollYProgress} start={0.22} active={!isMobile}>
                <div className="an5" style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                  {[['×','faster scheduling'],['0','double bookings'],['AI','powered matching']].map(([v,l], i) => (
                    <div key={l}>
                      <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 800, color: navy }}>
                        {i === 0 ? `${multiplier}${v}` : v}
                      </div>
                      <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </FadeOut>
            </div>

            {/* Right: calendar rotates in place (desktop only - flat and
                static on mobile, see the isMobile note above heroRef) */}
            <motion.div style={{
              rotateX: isMobile ? 0 : rotateX,
              rotateY: isMobile ? 0 : rotateY,
              scale: isMobile ? 1 : calScale,
              position: 'relative', transformStyle: isMobile ? undefined : 'preserve-3d',
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
                  <div style={{ margin: '0 auto', color: 'rgba(255,255,255,.45)', fontSize: '.72rem', fontFamily: display }}>
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

              <motion.div style={{
                opacity: isMobile ? 1 : badgeOpacity,
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
      <section id="features" style={{ padding: '88px 2rem', background: '#fff', fontFamily: body }}>
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
            Everything your clinic needs to run smoothly
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            From intake to recurring sessions, Summit handles the complexity so your team stays focused on clients.
          </p>
          <div className="grid-3" style={{ display: 'grid', gap: '1.25rem' }}>
            {[
              { icon: '🤖', title: 'AI-Powered Staff Matching',       desc: 'Automatically matches each client to the best-qualified, available staff — factoring session type, availability, and location in seconds.' },
              { icon: '📅', title: 'Smart Recurring Schedules',        desc: 'Set it once and Summit builds the full recurring calendar — weekly, biweekly, or custom — with zero manual entry required.' },
              { icon: '🗓️', title: 'Visual Drag-and-Drop Calendar',   desc: 'See your full week at a glance. Drag sessions to reposition them, with real-time conflict detection keeping everything clean.' },
              { icon: '👥', title: 'Multi-Portal Access',              desc: 'Dedicated views for admins, clinicians, and families. Everyone sees exactly what they need — nothing more.' },
              { icon: '🔒', title: 'HIPAA-Ready Infrastructure',       desc: 'Built on enterprise-grade infrastructure with role-based access control and encrypted data at rest and in transit.' },
              { icon: '📍', title: 'Multi-Location Support',           desc: 'Manage sessions across all your clinic locations from one dashboard. Staff, clients, and rooms all in one place.' },
            ].map((f, i) => (
              <div key={f.title} className="feature-card reveal" style={{
                background: off, borderRadius: 16,
                padding: '1.75rem', border: `1px solid ${g100}`,
                transitionDelay: `${(i % 3) * 90}ms`,
              }}>
                <div style={{
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
      <section id="how" style={{ padding: '88px 2rem', background: off, fontFamily: body }}>
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
            From intake to booked session in minutes
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            No training required. Summit guides your admin through each step with a simple, guided flow.
          </p>
          <div className="grid-3" style={{ display: 'grid', gap: '2rem' }}>
            {[
              { n: '1', title: 'Add your clients & staff',  desc: 'Enter client profiles and staff availability. Summit learns who can see who, and when — automatically.' },
              { n: '2', title: 'Run AI matching',            desc: 'Tell Summit the session type and parameters. It surfaces the best matches instantly, colour-coded by availability.' },
              { n: '3', title: 'Confirm & go',               desc: 'Review the proposed schedule, drag to adjust if needed, then confirm. Recurring sessions booked in bulk automatically.' },
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
      <section id="testimonials" className="testi-bg" style={{
        padding: '88px 2rem', background: '#0F2E3D',
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
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.45)' }}>Clinical Director, Clarity ABA Clinic</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="trial" style={{
        padding: '100px 2rem', background: grad,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
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
            color: 'rgba(255,255,255,.45)', fontSize: '1rem', letterSpacing: '-.01em',
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
              <a key={href} href={href} style={{ color: 'rgba(255,255,255,.4)', fontSize: '.82rem' }}>{label}</a>
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,.28)', fontSize: '.78rem' }}>© 2026 Summit Client Inc.</span>
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
