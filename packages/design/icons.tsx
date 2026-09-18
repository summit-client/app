import * as React from "react";

/**
 * The one icon set.
 *
 * Before this, five apps drew icons five different ways and the same glyph
 * meant different things in each: `◈` was Sessions in the scheduler,
 * Attention in the clinician portal and Scoreboard in MySummitHR; `⊙` was
 * Clients in one and My Credentials in another; `◎` was Staff, Review Queue
 * and My Team. Unicode glyphs also render at the mercy of whatever font the
 * device resolves, which is why they sat at 0.65 opacity to look deliberate.
 *
 * House rules, the same ones apps/web/components/Icon.tsx already documented
 * and the scheduler's calendar icons already followed:
 *   - 24x24 viewBox, drawn on a 2px inset so nothing touches the edge
 *   - stroke only, `currentColor`, 1.8 width, round caps and joins
 *   - no fills, so an icon inherits colour and dark mode for free
 *   - geometry simple enough to still read at 14px, which is where the
 *     sidebars render them
 *
 * Deliberately hand-authored rather than pulling in lucide/heroicons: this
 * repo carries no icon dependency today, a set this small does not justify
 * one, and CLAUDE.md's constraint on new dependencies is a standing one.
 */
export type IconName =
  // navigation / structure
  | "dashboard" | "calendar" | "session" | "sessionType" | "waitlist"
  | "location" | "home" | "settings" | "help"
  // people
  | "client" | "family" | "staff" | "team" | "profile"
  // clinical work
  | "tasks" | "attention" | "review" | "notes" | "goal" | "lesson" | "message"
  // HR
  | "scoreboard" | "recognition" | "career" | "development" | "credential"
  | "training" | "certificate" | "documents" | "onboarding" | "policies"
  | "payroll" | "timeOff"
  // state
  | "clock" | "recurring" | "visible" | "hidden";

/** Paths only - the <svg> wrapper and every shared attribute live in Icon. */
const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  session: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M9 15l2 2 4-4" /></>,
  sessionType: <><path d="M3 11.2V5.5A2.5 2.5 0 0 1 5.5 3h5.7a2 2 0 0 1 1.42.59l7.3 7.3a2 2 0 0 1 0 2.82l-5.7 5.7a2 2 0 0 1-2.82 0l-7.3-7.3A2 2 0 0 1 3 11.2Z" /><path d="M7.5 7.5h.01" /></>,
  waitlist: <><path d="M7 3h10M7 21h10" /><path d="M8 3v3.5a4 4 0 0 0 1.5 3.13L12 12l-2.5 2.37A4 4 0 0 0 8 17.5V21" /><path d="M16 3v3.5a4 4 0 0 1-1.5 3.13L12 12l2.5 2.37A4 4 0 0 1 16 17.5V21" /></>,
  location: <><path d="M20 10.5c0 5.2-6.3 10.2-7.6 11.16a.7.7 0 0 1-.8 0C10.3 20.7 4 15.7 4 10.5a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10.2" r="2.8" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.6V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.6" /><path d="M10 20.5v-5h4v5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.1 14.4a1.6 1.6 0 0 0 .33 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.33 1.6 1.6 0 0 0-1 1.46V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.76 1.6 1.6 0 0 0-1.46-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.33-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.33H9a1.6 1.6 0 0 0 1-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.76V9a1.6 1.6 0 0 0 1.46 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.46 1Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.37c-.55.2-.9.73-.9 1.32v.5" /><path d="M12 17h.01" /></>,

  client: <><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20.4c.6-3.7 3.6-6 7.2-6s6.6 2.3 7.2 6" /></>,
  family: <><circle cx="8.6" cy="8.4" r="3.1" /><circle cx="16.6" cy="10.4" r="2.4" /><path d="M3 20c.5-3.3 2.9-5.4 5.6-5.4S13.7 16.7 14.2 20" /><path d="M16 15c2.2 0 3.9 1.6 4.4 4" /></>,
  staff: <><circle cx="12" cy="7.6" r="3.4" /><path d="M5 20.4c.5-3.4 3.3-5.6 7-5.6s6.5 2.2 7 5.6" /><path d="M14.8 17.6h4.6" /><path d="M17.1 15.3v4.6" /></>,
  team: <><circle cx="9" cy="8.4" r="3.1" /><path d="M3.4 19.8c.5-3.1 2.8-5.1 5.6-5.1s5.1 2 5.6 5.1" /><path d="M16.2 6.2a3 3 0 0 1 0 5.9" /><path d="M17.4 14.9c1.7.5 2.9 2 3.2 4" /></>,
  profile: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="2.9" /><path d="M6.6 18.7a6 6 0 0 1 10.8 0" /></>,

  tasks: <><rect x="5" y="4.5" width="14" height="16" rx="2.2" /><path d="M9 4.5V3.6A1.6 1.6 0 0 1 10.6 2h2.8A1.6 1.6 0 0 1 15 3.6v.9" /><path d="M9.2 12.4l1.9 1.9 3.7-3.7" /></>,
  attention: <><path d="M10.6 3.9 2.9 17.4A1.6 1.6 0 0 0 4.3 19.8h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" /><path d="M12 9.4v3.8" /><path d="M12 16.4h.01" /></>,
  review: <><path d="M3.5 13.5h4l1.6 2.6h5.8l1.6-2.6h4" /><path d="M5.6 5.2 3.7 12.6a2 2 0 0 0-.06.5v3.2a2.2 2.2 0 0 0 2.2 2.2h12.3a2.2 2.2 0 0 0 2.2-2.2v-3.2a2 2 0 0 0-.07-.5L18.4 5.2A2.2 2.2 0 0 0 16.3 3.6H7.7a2.2 2.2 0 0 0-2.1 1.6Z" /></>,
  notes: <><path d="M6.5 2.8h7.3L19 8v13.2H6.5A1.5 1.5 0 0 1 5 19.7V4.3a1.5 1.5 0 0 1 1.5-1.5Z" /><path d="M13.6 3v5.1h5.2" /><path d="M8.7 13.4h6.6M8.7 17h4.4" /></>,
  goal: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1" /></>,
  lesson: <><path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H19v14.4H6.2A2.2 2.2 0 0 0 4 19.6Z" /><path d="M4 19.6A2.2 2.2 0 0 0 6.2 21.8H19" /><path d="M8.4 7.6h6.3" /></>,
  message: <><path d="M20.4 12.4a7.6 7.6 0 0 1-8.2 7.56 8.3 8.3 0 0 1-2.66-.5L4 21l1.6-4.5a7.4 7.4 0 0 1-1-3.76A7.6 7.6 0 0 1 12.2 4.9h.6a7.6 7.6 0 0 1 7.6 7.5Z" /></>,

  scoreboard: <><path d="M4 20.5V13m5 7.5V5.5m5 15V10m5 10.5V7.5" /></>,
  recognition: <><path d="m12 3.4 2.6 5.4 5.9.84-4.3 4.15 1.03 5.86L12 16.9l-5.23 2.75L7.8 13.8 3.5 9.64l5.9-.84Z" /></>,
  career: <><path d="M4 17.6 9.4 12l3.6 3.6 6.6-6.9" /><path d="M14.6 8.7h5v5" /></>,
  development: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7.2V12l3.2 1.9" /><path d="M12 3.4v1.5M20.6 12h-1.5M12 20.6v-1.5M3.4 12h1.5" /></>,
  credential: <><rect x="3" y="5.2" width="18" height="13.6" rx="2.4" /><circle cx="9" cy="11.4" r="2.2" /><path d="M5.4 16.6c.5-1.6 1.9-2.6 3.6-2.6s3.1 1 3.6 2.6" /><path d="M15 10.2h3.6M15 13.6h3.6" /></>,
  training: <><path d="M12 3.6 22 8.4 12 13.2 2 8.4Z" /><path d="M6 10.6v4.8c0 1.9 2.7 3.4 6 3.4s6-1.5 6-3.4v-4.8" /></>,
  certificate: <><circle cx="12" cy="9.4" r="5.6" /><path d="M8.4 14.2 7 21.4l5-2.4 5 2.4-1.4-7.2" /></>,
  documents: <><path d="M3.4 7.4a2 2 0 0 1 2-2h3.3l2 2.4h7.9a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2Z" /></>,
  onboarding: <><path d="M9.6 20.4H6a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2h3.6" /><path d="M15.4 16.4 20 12l-4.6-4.4" /><path d="M20 12H9.4" /></>,
  policies: <><path d="M12 2.9 4.8 5.9v5.6c0 4.4 3 8.4 7.2 9.6 4.2-1.2 7.2-5.2 7.2-9.6V5.9Z" /><path d="M9.2 11.9l1.9 1.9 3.7-3.7" /></>,
  payroll: <><rect x="2.6" y="6" width="18.8" height="12" rx="2.2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.2 12h.01M17.8 12h.01" /></>,
  timeOff: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>,

  clock: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7.2V12l3.2 1.9" /></>,
  recurring: <><path d="M3.6 10.2a8.4 8.4 0 0 1 14.2-4.1l2.6 2.5" /><path d="M20.4 3.8v4.8h-4.8" /><path d="M20.4 13.8a8.4 8.4 0 0 1-14.2 4.1l-2.6-2.5" /><path d="M3.6 20.2v-4.8h4.8" /></>,
  visible: <><path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12Z" /><circle cx="12" cy="12" r="3.1" /></>,
  hidden: <><path d="M10 6a9.6 9.6 0 0 1 2-.2c6 0 9.6 6.2 9.6 6.2a17 17 0 0 1-2.66 3.36" /><path d="M6.3 7.9A16.6 16.6 0 0 0 2.4 12S6 18.2 12 18.2a9.2 9.2 0 0 0 3.7-.76" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3.2 3.2l17.6 17.6" /></>,
};

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Rendered square. 14-16 in sidebars, 11 inside dense calendar rows. */
  size?: number;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by default: every call site in this repo pairs an icon with
      // its own text label, so announcing it twice is noise. Pass aria-hidden
      //={false} with an aria-label for the rare icon-only control.
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** True when a string is a name this set actually draws - lets a nav table
 *  keep storing plain strings and still fail visibly rather than rendering
 *  an empty box if one is renamed. */
export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, value);
}
