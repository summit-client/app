/**
 * The Summit icon set.
 *
 * One system, drawn to one grid, replacing the emoji that used to sit in dark
 * rounded tiles on the feature list. Emoji render differently on every platform
 * (Apple's are glossy, Windows' are flat, Android's differ again), carry no
 * brand, and are one of the clearest tells that a page was assembled rather
 * than designed.
 *
 * The rules, so anything added later matches rather than approximates:
 *
 *   24x24 viewBox, geometry on whole or half units
 *   1.6 stroke, round cap and join
 *   stroke only, no fills, so weight stays even at any size
 *   currentColor, so an icon takes the colour of the text it sits with
 *
 * Deliberately small. An icon exists here to help someone scan a list they are
 * reading top to bottom; it is not decoration, and there is no icon beside
 * every heading on the page — only in this one list, where six similar-length
 * items genuinely benefit from a distinguishing mark.
 */
import * as React from 'react'

export type IconName =
  | 'calendar'
  | 'pulse'
  | 'chart'
  | 'people'
  | 'credential'
  | 'shield'

const PATHS: Record<IconName, React.ReactNode> = {
  // Scheduling: a month grid with the binding rings.
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </>
  ),
  // Session data recorded as it happens: a live trace.
  pulse: (
    <>
      <path d="M3 12.5h4l2.5-6 4 12 2.5-6h5" />
    </>
  ),
  // Assessments and reports: measured values, rising.
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M7.5 16.5l3.5-4 3 2.5 4.5-6" />
    </>
  ),
  // The family portal: two people, one smaller.
  people: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M16 11.5a2.5 2.5 0 1 0-1.5-4.5" />
      <path d="M17 20v-1.5a4 4 0 0 0-1.6-3.2" />
    </>
  ),
  // Credentials: a seal with its ribbon.
  credential: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5" />
    </>
  ),
  // Privacy and access control.
  shield: (
    <>
      <path d="M12 3.5l7 2.5v5.5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" />
      <path d="M9.25 12l2 2 3.5-3.5" />
    </>
  ),
}

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  )
}
