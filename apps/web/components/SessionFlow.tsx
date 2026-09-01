import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useMotionValue, type MotionValue } from 'motion/react'

/**
 * One session, moving through the system.
 *
 * This replaces three paragraphs describing that a booking becomes hours,
 * a charge, a statement and a payroll line. Showing it is both shorter and more
 * convincing than saying it: each stage is a small piece of real product UI,
 * and they light up in the order the data actually moves (migration 0031).
 *
 * Scroll-linked rather than looping. A loop is decoration you cannot control;
 * tying it to scroll means the reader sets the pace, can stop on a stage, and
 * can go back. Nothing moves unless they move.
 *
 * Under prefers-reduced-motion, or below the mobile breakpoint, every stage
 * renders in its final state as a plain vertical list. Nothing is hidden behind
 * an animation that will not play, which is the failure mode that leaves a
 * section blank for the people most likely to need it legible.
 */

type Stage = {
  key: string
  label: string
  caption: string
  panel: (active: boolean) => React.ReactNode
}

const INK = '#0B2B31'
const SLATE = '#254449'
const TEAL = '#0C5350'
const LINE = '#C9DED8'
const TINT = '#F1F7F4'
const MUTED = '#5A787C'

/** A compact product surface. Deliberately not a screenshot: real markup stays
 *  crisp at any width, reflows on a phone, and cannot go stale. */
function Panel({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${active ? TEAL : LINE}`,
        borderRadius: 8,
        padding: '14px 16px',
        fontSize: 13,
        color: SLATE,
        boxShadow: active ? '0 8px 28px rgba(11,43,49,.10)' : 'none',
        transition: 'border-color .35s ease, box-shadow .35s ease',
      }}
    >
      {children}
    </div>
  )
}

function Row({ left, right, strong }: { left: string; right: string; strong?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '5px 0', borderBottom: `1px solid ${TINT}`,
      fontWeight: strong ? 600 : 400, color: strong ? INK : SLATE,
    }}>
      <span>{left}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  )
}

const STAGES: Stage[] = [
  {
    key: 'booked',
    label: 'Booked',
    caption: 'A session is scheduled against a client and a clinician.',
    panel: () => (
      <Panel active>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: '.06em', marginBottom: 8 }}>WEDNESDAY 14 MAY</div>
        <Row left="09:00  Direct therapy" right="J. Martinez" strong />
        <Row left="Clinician" right="A. Osei" />
        <Row left="Site" right="Durham" />
      </Panel>
    ),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    caption: 'The clinician runs it in the app. Observations are recorded as they happen.',
    panel: () => (
      <Panel active>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: '.06em', marginBottom: 8 }}>SESSION RECORD</div>
        <Row left="Requesting — independent" right="14 / 16" strong />
        <Row left="Joint attention" right="9 / 12" />
        <Row left="Duration" right="2h 00m" />
      </Panel>
    ),
  },
  {
    key: 'hours',
    label: 'Hours',
    caption: 'Time appears on the clinician’s timesheet. Nobody re-keys it.',
    panel: () => (
      <Panel active>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: '.06em', marginBottom: 8 }}>TIMESHEET</div>
        <Row left="Direct therapy" right="2.00 h" strong />
        <Row left="Documentation" right="0.50 h" />
        <Row left="Week to date" right="38.50 h" />
      </Panel>
    ),
  },
  {
    key: 'charge',
    label: 'Charged',
    caption: 'The funding line is posted at the rate set for that service.',
    panel: () => (
      <Panel active>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: '.06em', marginBottom: 8 }}>FUNDING</div>
        <Row left="Direct therapy — 2.00 h" right="220.00" strong />
        <Row left="Spent to date" right="4,180.00" />
        <Row left="Remaining" right="17,820.00" />
      </Panel>
    ),
  },
  {
    key: 'statement',
    label: 'Visible',
    caption: 'The family sees the session and a statement that reconciles.',
    panel: () => (
      <Panel active>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: '.06em', marginBottom: 8 }}>FAMILY STATEMENT</div>
        <Row left="14 May — Direct therapy" right="220.00" strong />
        <Row left="07 May — Direct therapy" right="220.00" />
        <Row left="Balance" right="17,820.00" />
      </Panel>
    ),
  },
]

/**
 * Clamp a list of scroll stops into [0,1] and force it strictly increasing.
 *
 * useTransform hands its input array to the Web Animations API as keyframe
 * offsets, which rejects anything outside [0,1] or out of order — and rejects
 * the whole set, so one bad stop blanks the component rather than degrading it.
 * Clamping alone is not enough: it collapses the first two stops of stage 0 to
 * 0 and 0, so each is nudged past the last by a hair.
 */
function rising(values: number[]): number[] {
  const out: number[] = []
  for (const v of values) {
    const clamped = Math.min(1, Math.max(0, v))
    const prev = out[out.length - 1]
    out.push(prev === undefined || clamped > prev ? clamped : Math.min(1, prev + 0.0001))
  }
  return out
}

function StageBlock({
  stage, index, progress, staticScene,
}: {
  stage: Stage
  index: number
  progress: MotionValue<number>
  staticScene: boolean
}) {
  // Each stage owns a slice of the scroll. They overlap slightly so one is
  // always arriving as the last settles, rather than the section going blank
  // between them.
  //
  // The stops are clamped into [0,1] and forced strictly increasing. Without
  // that the first stage's lead-in computes to -0.1, and the Web Animations
  // API rejects the whole keyframe set: "Offsets must be null or in the range
  // [0,1]", which takes the section down rather than degrading.
  const span = 1 / STAGES.length
  const start = index * span
  const stops = rising([start - span * 0.5, start, start + span, start + span * 1.5])
  const opacity = useTransform(progress, stops, [0.25, 1, 1, 0.25])
  const y = useTransform(progress, [stops[0], stops[1]], [18, 0])

  const [active, setActive] = useState(index === 0)
  useEffect(() => {
    if (staticScene) { setActive(true); return }
    return progress.on('change', (v) => {
      setActive(v >= start - span * 0.25 && v < start + span * 1.25)
    })
  }, [progress, start, span, staticScene])

  return (
    <motion.div
      style={staticScene ? undefined : { opacity, y }}
      className="flow-stage"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{
          fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 600,
          color: active ? TEAL : MUTED, letterSpacing: '.08em', textTransform: 'uppercase',
          transition: 'color .35s ease',
        }}>{stage.label}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: LINE }} />
      </div>
      {stage.panel(active)}
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginTop: 10, maxWidth: '34ch' }}>
        {stage.caption}
      </p>
    </motion.div>
  )
}

export function SessionFlow() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  // Same pattern the hero uses: start false so the server-rendered HTML and
  // the first client render agree, then flip in an effect. Reduced motion and
  // small screens both land on the static list.
  const [staticScene, setStaticScene] = useState(false)
  useEffect(() => {
    const small = window.matchMedia('(max-width: 860px)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStaticScene(small.matches || reduced.matches)
    on()
    small.addEventListener('change', on)
    reduced.addEventListener('change', on)
    return () => { small.removeEventListener('change', on); reduced.removeEventListener('change', on) }
  }, [])

  const settled = useMotionValue(1)
  const progress = staticScene ? settled : scrollYProgress

  return (
    <div ref={ref} className="flow-track">
      <div className="flow-sticky">
        <div className="flow-inner">
          <div className="flow-intro">
            <div style={{
              fontFamily: "'Outfit',sans-serif", fontSize: '.72rem', fontWeight: 600,
              letterSpacing: '.1em', textTransform: 'uppercase', color: TEAL, marginBottom: '.7rem',
            }}>One session</div>
            <h2 style={{
              fontFamily: "'Outfit',sans-serif", fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
              letterSpacing: '-0.015em', fontWeight: 600, color: INK, marginBottom: '.9rem',
            }}>
              Recorded once. Everywhere it needs to be.
            </h2>
            <p style={{ fontSize: '1rem', color: '#3D5A6A', lineHeight: 1.7, maxWidth: '38ch' }}>
              Booking a session is the only thing anyone types. The hours, the charge and
              the family&apos;s statement are the same record, read from different angles.
            </p>
          </div>

          <div className="flow-stages">
            {STAGES.map((s, i) => (
              <StageBlock key={s.key} stage={s} index={i} progress={progress} staticScene={staticScene} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
