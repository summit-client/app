import { useEffect, useState, useRef, ReactNode } from 'react'
import { motion, useScroll, useSpring, useTransform, useMotionValue, MotionValue } from 'motion/react'
import { Icon, type IconName } from '../components/Icon'
import { SessionFlow } from '../components/SessionFlow'

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

// "What it replaces" rows — shared between the desktop <table> and the
// mobile stacked-card list below so the two renderings can never drift
// apart in content, only in layout.
const COMPARE_ROWS: [string, string][] = [
  ['Scheduling, matching and recurring calendars', 'Practice management'],
  ['Client records, contacts and service history', 'Practice management'],
  ['Session data captured as it happens', 'A separate data tool'],
  ['Programs, goals and progress graphs', 'A separate data tool'],
  ['Structured assessments and scoring', 'A separate data tool'],
  ['Clinical notes, signature and countersignature', 'Practice management'],
  ['Caseload review and documentation oversight', 'Spreadsheets'],
  ['Family portal with progress and statements', 'A separate portal, or email'],
  ['Funding allocations, spend and reconciliation', 'Accounting, plus spreadsheets'],
  ['Staff records, onboarding and training', 'An HR system'],
  ['Credentials and continuing education tracking', 'Spreadsheets'],
  ['Timesheets, approvals and overtime rules', 'A payroll system'],
  ['Hours, utilization and cost by service', 'Spreadsheets'],
]

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

  // Brand colours, from the SummitClient colour system.
  //
  // No gradients anywhere on this page. Every surface is a flat fill: the
  // hierarchy comes from ink weight, spacing, borders and the product UI
  // itself, which is how clinic software that people use all day tends to
  // look, and how it stays legible when screenshotted or printed.
  //
  // `ink` replaces what used to be a three-stop brand gradient. Where a
  // surface previously carried that gradient it now carries ink, and white
  // text on ink measures 15.4:1, so the black scrim that used to rescue
  // contrast at the gradient's light end is gone too.
  const ink   = '#0B2B31'   // deepest: solid sections, headings
  const navy  = '#254449'   // secondary ink
  const brand = '#0C5350'   // primary action. 8.2:1 on white
  const brandHover = '#0F6A67'
  // Darkened from the brand's #28B4A6/#7A9AAD for text use only - both failed
  // WCAG AA (2.57:1 and 2.98:1 on white) at the small sizes they're set in
  // here. Decorative uses of the brand teal (icon fills, gradients, the
  // SessionCell mockup) stay on the literal hex elsewhere in this file.
  const teal  = '#0C5350'
  const g100  = '#EEF3F6'
  const g500  = '#57748A'
  const g700  = '#3D5A6A'
  const off   = '#F7FAFB'
  const display = "'Outfit',sans-serif"
  const body    = "'Source Sans 3',sans-serif"

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
  // No scroll-linked fade on the hero-sticky wrapper itself (there used to be
  // one, [0.88, 1] -> [1, 0]) - it was the real source of the oversized gap
  // between the hero and the rest of the page, not a missing/wrong
  // margin-padding-gap value anywhere. `useScroll`'s `['start start','end
  // end']` offset saturates scrollYProgress at 1 at exactly the scroll
  // position where `.hero-sticky`'s `position: sticky` naturally releases
  // (both are pinned to "container bottom reaches viewport bottom") - and
  // from there, `.hero-bg`'s own remaining height is always exactly one more
  // viewport tall, however tall `.hero-bg` itself is set to (that's just
  // what "a nearly-viewport-tall sticky child, in a container that ends
  // right after it" requires - shrinking `.hero-bg`'s 320vh doesn't change
  // this, it only compresses everything before it). scrollYProgress is
  // clamped at 1 for that entire final viewport, so any opacity curve that
  // reaches 0 by progress 1 (as this one deliberately did) stays at 0 for
  // that whole extra scroll - a full viewport of scrolling with nothing on
  // screen. Removing the fade costs nothing: every element it was wrapping
  // already resolves its own end state well before progress 1 (pills settle
  // by ~0.68, calScale/rotateX/rotateY by 0.85, the connector lines fade
  // themselves out by 0.9), so the scene is already visually "done." Once
  // `position: sticky` releases, that finished scene just scrolls normally
  // out of view with the rest of the page - the same way any non-sticky
  // element would - instead of sitting invisible while the page scrolls
  // under it.

  // Three pills, one per portal the platform actually gives someone, rather
  // than three scheduler features. PILL_COUNT above must stay at 3.
  //
  // The privacy pill has read "HIPAA-ready" and then "PHIPA and PIPEDA". Both
  // scope the product to one country. Health data law differs by jurisdiction
  // and none of it is satisfied by a badge on a marketing page, so this
  // describes the architecture instead: tenant isolation enforced by the
  // database. That claim holds in every market and can be checked.
  const PILLS = [
    { glyph: '🗓️', title: 'Schedule and deliver', sub: 'Matched, booked, recorded in the app' },
    { glyph: '📈', title: 'Data to reports',      sub: 'Graphs and notes from what was recorded' },
    { glyph: '🔒', title: 'Isolation by design',  sub: 'Enforced in the database, not the app' },
  ]

  return (
    <>

{/* ── HERO / SCROLL SCENE ── */}
      <div ref={heroRef} className="hero-bg" style={{
        background: '#F1F7F4',
      }}>
        <motion.div className="hero-sticky" style={{
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
                    fontSize: '.78rem', fontWeight: 600,
                    padding: '.35rem .8rem', borderRadius: 100,
                    marginBottom: '1.25rem',
                    fontFamily: display, letterSpacing: '.02em',
                  }}>
                    Clinic management, end to end
                  </div>
                </FadeOut>

                <FadeOut progress={scrollYProgress} start={0.13} active={!staticScene}>
                  <h1 className="an2" style={{
                    fontFamily: display,
                    fontSize: 'clamp(2.1rem,3.8vw,3.1rem)',
                    letterSpacing: '-0.02em',
                    fontWeight: 600, lineHeight: 1.15,
                    color: navy, marginBottom: '1.25rem',
                  }}>
                    Your clinic.<br />
                    One{' '}
                    <span className="grad-text">operating system.</span>
                  </h1>
                </FadeOut>

                <FadeOut progress={scrollYProgress} start={0.16} active={!staticScene}>
                  <p className="an3" style={{
                    fontSize: '1.05rem', color: g700,
                    marginBottom: '2rem', maxWidth: 460, lineHeight: 1.75,
                  }}>
                    Clients, clinical work, documentation, scheduling, staff and operations in one connected workspace. Instead of five systems that each hold part of the picture.
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
                  background: ink, color: '#fff',
                  fontFamily: display, fontSize: '1rem', fontWeight: 600,
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
                <div className="an5 hero-stats" style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                  {/* One stat per part of the platform, not three about the
                      calendar. "1" is the actual claim being made: the session
                      is recorded once and the note, the graph, the family
                      statement and the timesheet all come from that record. */}
                  {[['1','record, end to end'],['','portals, one login'],['0','double entry']].map(([v,l], i) => (
                    <div key={l}>
                      <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 600, color: navy }}>
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
                  background: ink, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '1rem',
                }}>✓</div>
                <div>
                  <div style={{ fontFamily: display, fontSize: '.78rem', fontWeight: 600, color: navy }}>12 sessions booked</div>
                  <div style={{ fontSize: '.68rem', color: g500 }}>Conflicts resolved automatically</div>
                </div>
              </motion.div>
            </motion.div>

          </div>
        </motion.div>
      </div>

      {/* The fabricated "trusted by" logo marquee that used to sit here is gone.
          Every name in it was invented (Beacon ABA, Clarity Clinic, Pathways,
          Bright Futures ABA...), presented under "Trusted by growing ABA
          clinics across North America". Invented customer names on a live page
          are a claim, not decoration, and this product has real clinics it can
          name once they agree to be named. Nothing replaces it until then: an
          honest gap reads better than fake proof. */}

      {/* ── FEATURES ── */}
      <section id="features" className="landing-section" style={{ background: '#fff', fontFamily: body }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 600,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>Features</div>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            letterSpacing: '-0.015em',
            fontWeight: 600, color: navy, marginBottom: '.9rem', maxWidth: 580,
          }}>
            One platform, from the first booking to the last payroll line
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            Most of this is work that usually takes three or four separate systems, plus the reconciliation between them.
          </p>
          <div className="grid-3 feature-rows" style={{ display: 'grid' }}>
            {[
              { icon: 'calendar', title: 'Scheduling that matches',      desc: 'Matches each client to qualified, available staff and builds the recurring calendar, with conflict detection as you drag. Across every site you run.' },
              { icon: 'pulse', title: 'Session data as it happens',  desc: 'Run the session in the app and record observations as they occur. Graphs and mastery are derived from that data, never typed in a second time.' },
              { icon: 'chart', title: 'Assessments and reports',     desc: 'Structured assessments scored in place, with ABLLS-R, AFLS, ADL and MOTAS among the instruments supported. Reports build from the evidence recorded, and a clinician signs every one.' },
              { icon: 'people', title: 'A portal families use',       desc: 'Upcoming sessions, progress, signed notes, and a funding statement that reconciles: total budget, spent to date, and every charge behind it.' },
              { icon: 'credential', title: 'Credentials and training',    desc: 'Onboarding, training records and certificates, with a credential framework that tracks continuing education against whichever bodies your staff are registered with, counting one course toward each without inflating the total.' },
              { icon: 'shield', title: 'Time, pay and privacy',       desc: 'Delivered sessions become hours and charges on their own. Overtime follows the work week your organization declares, and pay rules are configured per region rather than hard-coded to one.' },
            ].map((f, i) => (
              /* Not a card. Six short, parallel items in a list a person reads
                 top to bottom do not each represent a discrete object, so a
                 border and a fill around every one adds containment nobody
                 needed and turns the section into a grid of boxes. A hairline
                 rule and the type scale carry the same grouping with less
                 furniture, and the icon sits inline with the title rather than
                 in a 46px dark tile above it. */
              <div key={f.title} className="feature-row reveal reveal-slide" style={{
                transitionDelay: `${i * 70}ms`,
              }}>
                <h3 style={{
                  fontFamily: display, fontSize: '1rem', fontWeight: 600,
                  color: navy, marginBottom: '.45rem',
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                }}>
                  <span style={{ color: teal }}><Icon name={f.icon as IconName} size={20} /></span>
                  {f.title}
                </h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT IT REPLACES ──
          Rows are capabilities; the middle column is the kind of system that
          capability usually lives in. No competitor is named and none is said
          to lack anything: the comparison is against the stack, which is what
          a clinic is actually choosing between, and every Summit cell is
          backed by something in the product rather than by a marketing claim. */}
      <section id="compare" className="landing-section" style={{ background: '#fff', fontFamily: body }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 600,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>What it replaces</div>
          <h2 style={{
            fontFamily: display, fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            letterSpacing: '-0.015em',
            fontWeight: 600, color: navy, marginBottom: '.9rem', maxWidth: 620,
          }}>
            Most clinics run four or five systems. Here is what each one is for.
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 560, marginBottom: '2.4rem', lineHeight: 1.7 }}>
            The cost is rarely the licences. It is the reconciliation: the same client,
            the same session and the same hour entered more than once, then compared by
            hand at month end.
          </p>

          {/* Real <table> at desktop widths — thirteen rows of two short
              values each is exactly what a table is for, and a screen
              reader announces the column when reading a cell, which the
              stacked-card version below cannot do.

              Below 640px this table is replaced (not just scrolled) by a
              per-row card list: PR #122 pinned the Summit column with
              `position: sticky` so it was at least reachable by swiping,
              but the request here was to stop needing left-right scrolling
              at all, not to make the scroll shorter. Both renderings map
              the same COMPARE_ROWS array so the content can't drift; CSS
              (`.compare-wrap`/`.compare-cards` in globals.css) shows
              exactly one of the two per viewport width. */}
          <div className="compare-wrap">
            <table className="compare">
              <caption className="visually-hidden">
                Clinic capabilities, the kind of system each usually requires, and whether Summit covers it
              </caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Usually lives in</th>
                  <th scope="col" className="compare-us">Summit</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([capability, lives]) => (
                  <tr key={capability}>
                    <th scope="row">{capability}</th>
                    <td>{lives}</td>
                    <td className="compare-us">
                      <Icon name="check" size={18} />
                      <span className="visually-hidden">Included in Summit</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Systems to run</th>
                  <td>Four to five</td>
                  <td className="compare-us"><b>One</b></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="compare-cards">
            {COMPARE_ROWS.map(([capability, lives]) => (
              <li className="compare-card" key={capability}>
                <div className="compare-card-title">{capability}</div>
                <div className="compare-card-row">
                  <span className="compare-card-label">Usually lives in</span>
                  <span className="compare-card-value">{lives}</span>
                </div>
                <div className="compare-card-row compare-card-us">
                  <span className="compare-card-label">With Summit</span>
                  <span className="compare-card-value compare-card-check">
                    <Icon name="check" size={16} /> Included
                  </span>
                </div>
              </li>
            ))}
            <li className="compare-card compare-card-total">
              <div className="compare-card-title">Systems to run</div>
              <div className="compare-card-row">
                <span className="compare-card-label">Without Summit</span>
                <span className="compare-card-value">Four to five</span>
              </div>
              <div className="compare-card-row compare-card-us">
                <span className="compare-card-label">With Summit</span>
                <span className="compare-card-value compare-card-check"><b>One</b></span>
              </div>
            </li>
          </ul>

          <p style={{ fontSize: '.8rem', color: g500, marginTop: '1.5rem', maxWidth: 620, lineHeight: 1.65 }}>
            The middle column describes the category of product a capability normally
            requires, not any particular vendor. Several suites cover more than one row,
            and which rows they cover changes release to release.
          </p>
        </div>
      </section>

      {/* ── SESSION FLOW ──
          Was three numbered paragraphs saying that a booking becomes hours, a
          charge and a statement. Showing it is shorter and more convincing:
          five pieces of real product UI lighting up in the order the data
          actually moves. Scroll-linked rather than looping, so the reader sets
          the pace and can stop on a stage. */}
      <section id="how" style={{ background: off, fontFamily: body }}>
        <SessionFlow />
      </section>

      {/* ── TRUST ──
          This replaces a fabricated testimonial: "Sarah Chen, BCBA-D, Clinical
          Director, Clarity ABA Clinic" was not a real person and not a real
          clinic, quoted on a live public page as a customer endorsement.

          What sits here instead is only what can be substantiated. Note what
          is deliberately NOT claimed: no HIPAA badge (a US regime that does not
          bind this product), no SOC 2, no "compliant" of any kind. Those are
          audit outcomes, not design decisions, and a clinic's compliance
          reviewer treats an unearned badge as a reason to distrust everything
          next to it. Each line below describes something the schema actually
          does. */}
      <section id="trust" className="landing-section" style={{
        background: ink, position: 'relative', fontFamily: body,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 600,
            letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,.55)', marginBottom: '.7rem',
          }}>How your data is held</div>
          <h2 style={{
            fontFamily: display, fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            letterSpacing: '-0.015em',
            fontWeight: 600, color: '#fff', marginBottom: '.9rem', maxWidth: 620,
          }}>
            Built for organizations that answer for their records
          </h2>
          <p style={{
            fontSize: '1rem', color: 'rgba(255,255,255,.72)',
            maxWidth: 560, marginBottom: '2.8rem', lineHeight: 1.7,
          }}>
            Health data law differs by jurisdiction, and no badge on a marketing page
            satisfies any of it. What follows is how the system is built, which is the
            part a reviewer in any market can check.
          </p>

          <div className="grid-3" style={{ display: 'grid', gap: '1.75rem' }}>
            {[
              ['Every record belongs to one organization',
               'Client, staff and clinical data are separated at the database level, not by a filter the application remembers to apply. A query from one organization cannot return another\u2019s rows.'],
              ['People see what their role allows',
               'Permissions are granted per action rather than per job title, so a scheduler can book without reading clinical notes, and whoever administers HR does not thereby see health information.'],
              ['Findings trace back to their evidence',
               'Where Summit summarizes or interprets, the underlying observations stay linked to the output. A clinician can follow any statement back to what it came from, and signs before it counts.'],
              ['Clinical and HR stay apart',
               'A supervisor reads their own supervisee\u2019s development plan, not a colleague\u2019s. Pay rates are narrower still: your own, or payroll\u2019s.'],
              ['Corrections are recorded, not overwritten',
               'Reconciled charges, approved time and issued documents are amended by adding a correcting entry. The original stays, so a figure can always be explained.'],
              ['Signatures belong to the signer',
               'Only the person a signature belongs to can record one. There is no path by which an administrator can sign on someone else\u2019s behalf.'],
            ].map(([title, desc], i) => (
              <div key={title} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                <div style={{
                  width: 30, height: 2, background: '#6BC7BD', marginBottom: '1rem',
                }} />
                <div style={{
                  fontFamily: display, fontSize: '1rem', fontWeight: 600,
                  color: '#fff', marginBottom: '.5rem', lineHeight: 1.35,
                }}>{title}</div>
                <p style={{
                  fontSize: '.875rem', color: 'rgba(255,255,255,.66)', lineHeight: 1.7,
                }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="trial" className="landing-section-lg" style={{
        background: ink,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(2rem,3.8vw,2.9rem)',
            letterSpacing: '-0.02em',
            fontWeight: 600, color: '#fff', marginBottom: '1rem', lineHeight: 1.2,
          }}>
            See what your clinic looks like connected.
          </h2>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '1.05rem', marginBottom: '2.5rem' }}>
            We will show you your own workflows in Summit, not a generic demo.
          </p>
          <a href="/signup" className="btn-primary" style={{
            background: '#fff', color: navy,
            fontFamily: display, fontSize: '1rem', fontWeight: 600,
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
            fontFamily: display, fontWeight: 600,
            color: 'rgba(255,255,255,.6)', fontSize: '1rem', letterSpacing: '-.01em',
          }}>SUMMIT</span>
          {/* flexWrap: pre-existing gap - on a narrow viewport these six
              links don't fit one line and were overflowing the page
              horizontally, invisibly, because they've always been masked by
              html/body's own overflow-x:hidden. That rule is what was
              breaking the hero's scroll-pinned scene below (see the
              `.hero-bg` comment in globals.css), so fixing it here is a
              prerequisite for removing it there, not a separate feature. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '.6rem', gap: '.6rem 2rem' }}>
            {([
              ['Features','#features'],
              ['How it works','#how'],
              ['Security','#trust'],
              ['Contact','mailto:info@summitclient.io'],
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
          background: '#0B2B31',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem',
        }}>{glyph}</div>
        <div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: '.95rem', fontWeight: 600, color: '#1A3F5C' }}>{title}</div>
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

  // Flat fills. These encode service category, so they stay distinguishable
  // by hue, and each is dark enough to carry white label text at AA.
  const bg =
    type === 'teal' ? '#0C5350' :
    type === 'blue' ? '#254449' :
                      '#8A5A12'

  return (
    <motion.div style={{
      scale,
      position: 'relative', height: 62, borderRadius: 6,
      willChange: 'transform',
    }}>
      <div style={{
        height: '100%', borderRadius: 6, padding: '3px 5px',
        fontSize: '.6rem', fontWeight: 600, color: '#fff',
        fontFamily: "'Outfit',sans-serif", lineHeight: 1.3,
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
