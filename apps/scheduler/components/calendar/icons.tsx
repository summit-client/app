/**
 * Small inline SVG icons for the calendar rebuild - location pin, home,
 * clinician, client, session-type dot, recurring. No new dependency:
 * apps/scheduler already keeps its own token/style copy rather than
 * depending on @summit/design (see root CLAUDE.md), so a shared icon
 * library doesn't fit this app's existing pattern either.
 *
 * Deliberately icons over words per the original ask, EXCEPT the actual
 * date/time range ("Thu 2026-08-20 4:00 PM - 5:00 PM") - see
 * dateUtils.formatFullRange - which stays text since no icon can carry it.
 */
import * as React from "react";

interface IconProps {
  size?: number;
  color?: string;
  title?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function LocationPinIcon({ size = 14, color, title }: IconProps) {
  return (
    <svg {...base(size)} style={{ color }} aria-label={title} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function HomeIcon({ size = 14, color, title }: IconProps) {
  return (
    <svg {...base(size)} style={{ color }} aria-label={title} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function ClinicianIcon({ size = 14, color, title }: IconProps) {
  return (
    <svg {...base(size)} style={{ color }} aria-label={title} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.13-6 7-6s7 2.4 7 6" />
      <path d="M9.5 5.3 12 2.5l2.5 2.8" />
    </svg>
  );
}

export function ClientIcon({ size = 14, color, title }: IconProps) {
  return (
    <svg {...base(size)} style={{ color }} aria-label={title} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.13-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

export function RecurringIcon({ size = 14, color, title }: IconProps) {
  return (
    <svg {...base(size)} style={{ color }} aria-label={title} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d="M17 2 21 6 17 10" />
      <path d="M3 12v-1a5 5 0 0 1 5-5h13" />
      <path d="M7 22 3 18 7 14" />
      <path d="M21 12v1a5 5 0 0 1-5 5H3" />
    </svg>
  );
}

/** A single-session color dot, matching session_types.color - same visual
 *  language the type-color left-border/tooltip already use elsewhere. */
export function SessionTypeDot({ size = 8, color }: { size?: number; color: string }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}
