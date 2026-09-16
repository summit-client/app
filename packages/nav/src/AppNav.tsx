import React from 'react';
import { type AppRole, type PortalKey, portals, portalsFor } from './portals.config';

interface AppNavProps {
  activeKey: string;
  /**
   * An org-level override on which portals this role's pills show, already
   * parsed (see @summit/portals' `parseVisiblePortals`) from
   * @summit/settings' `nav.visiblePortals`. Optional and additive: omit it,
   * or pass `undefined`/`null`/an empty array, and the bar shows exactly
   * what it always has — `portalsFor(role)`'s unfiltered list. AppNav takes
   * no dependency on @summit/settings itself (nav stays as free of a
   * Supabase-backed read as @summit/portals is) — every caller reads the
   * setting itself, where it already calls initSettings(), and passes the
   * parsed result in.
   */
  visiblePortals?: readonly PortalKey[] | null;
  /**
   * When set, an "Admin" pill sits at the far right of the bar, before the
   * settings cogwheel and sign-out control. Whether to pass it at all is the
   * caller's call, same as settingsHref/signOutHref below - AppNav is shared
   * across every portal and has no idea which of them even has an /admin
   * route, let alone who on that portal may see it.
   */
  adminHref?: string;
  /** When set, a settings cogwheel sits at the right of the bar. */
  settingsHref?: string;
  /**
   * When set, a profile avatar sits at the right of the bar (after
   * settingsHref, before signOutHref). This should be the shared
   * `profileUrl(role)` from @summit/portals, same reasoning as signOutHref
   * pointing at signOutUrl() rather than a local route. Every role can see
   * this one; there is no admission question here the way there is for
   * adminHref.
   */
  profileHref?: string;
  /**
   * The viewer's display name, shown as initials inside the profile avatar
   * circle. Optional and purely cosmetic - pass `undefined`/`null` (identity
   * still resolving, or none on file) and the avatar falls back to a plain
   * person glyph instead of blank or guessed initials.
   */
  profileName?: string | null;
  /**
   * Drives a progress ring drawn around the profile avatar. `percent` (0-100)
   * is the fill - overall required+applicable onboarding completion, same
   * number the Onboarding screen's own bar shows. `state` picks the colour,
   * and the priority order is deliberate: `"critical"` wins outright even at
   * 99% (an outstanding supervisor-signoff task - HR paperwork, the VSC -
   * still reads as urgent), `"important"` only once every critical task is
   * done, `"complete"` once both are. `label` is the hover/aria text (e.g.
   * "2 critical, 1 important task left").
   *
   * Optional: only apps/employee has this data today
   * (`hub_task_progress`/`HUB_TASKS`, via `lib/hub.ts`'s `priorityProgress()`
   * - see `apps/employee/components/portal-bar.tsx`). Every other portal's
   * caller passes nothing, same as adminHref above, and the avatar renders
   * exactly as it did before this existed.
   */
  priorityStatus?: {
    percent: number;
    state: "critical" | "important" | "complete";
    label: string;
  } | null;
  /**
   * When set, a sign-out control sits at the far right of the bar (after the
   * settings cogwheel, if both are present). This must be the shared
   * `signOutUrl()` from @summit/portals, not a local supabase.auth.signOut()
   * call - see that function's own comment for why a per-portal signOut()
   * cannot actually end the cross-portal session. Deliberately a plain link,
   * not a button with an onClick: @summit/nav takes no Supabase dependency,
   * and a real navigation is exactly what's needed here anyway (see above).
   */
  signOutHref?: string;
  /**
   * The viewer's `profiles.role`. Identity resolves asynchronously (it's a
   * Supabase round trip), so callers pass `undefined` while it's in flight and
   * the real value once it lands - `role` is not an optional extra, every
   * caller is expected to wire it up as it gains identity.
   *
   * `undefined` (still resolving) shows only `activeKey`: the viewer is
   * already on that portal, so it is certainly permitted, and this is what
   * stops the bar from flashing all four portals - including ones the role
   * will turn out not to admit - before the role is known. A parent briefly
   * seeing "Clinician Portal" while the family portal's identity call is in
   * flight is the exact leak this guards against.
   *
   * `null` gets the same treatment, not `portalsFor(null)`'s empty list.
   * `null` means identity resolved with no admitted role - NO_PROFILE, or a
   * role string the registry doesn't recognise - and a zero-portal bar reads
   * as broken chrome, not as a gate; the screen underneath already carries
   * `explainProblem()`'s explanation. Only a real `AppRole` narrows the bar
   * to `portalsFor(role)`.
   */
  role?: AppRole | null;
}

/**
 * The cross-portal bar. One rail across Scheduler, Clinician, Employee and
 * Client so staff move between them from any screen. Colours come from the
 * shared tokens, so it follows the theme and accent like everything else.
 */
export function AppNav({ activeKey, adminHref, settingsHref, profileHref, profileName, priorityStatus, signOutHref, role, visiblePortals }: AppNavProps) {
  const visible = role == null
    ? portals.filter((p) => p.key === activeKey)
    : portalsFor(role, visiblePortals);
  const initials = profileName
    ? profileName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")
    : null;
  return (
    <nav
      aria-label="Summit portals"
      // .app-nav-scroll (components.css) hides the scrollbar cross-browser;
      // the scroll behavior itself is inline since everything else here is.
      // Overflow-x, not wrap: --portalnav-h is a fixed token that dozens of
      // calc(100vh - var(--portalnav-h)) / position:sticky rules across every
      // app depend on, so the bar's height can never grow on a narrow screen.
      // whiteSpace: nowrap on each pill below gives every item a min-content
      // width equal to its full label, so flex only overflows, never
      // squashes text - that's what makes the scroll (not a wrap or a
      // squeeze) the thing that happens on a phone.
      className="app-nav-scroll"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1, 4px)',
        height: 'var(--portalnav-h, 51px)',
        boxSizing: 'border-box',
        padding: '0 var(--space-5, 20px)',
        background: 'var(--brand-800, #1A3F5C)',
        borderBottom: '1px solid var(--brand-600, #28B4A6)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {visible.map((p) => {
        const isActive = p.key === activeKey;
        return (
          <a
            key={p.key}
            href={p.url}
            aria-current={isActive ? 'page' : undefined}
            style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 'var(--text-sm, 13px)',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--brand-200, #28B4A6)' : 'oklch(100% 0 0 / 0.66)',
              textDecoration: 'none',
              padding: '5px 13px',
              borderRadius: 'var(--radius-full, 999px)',
              background: isActive ? 'oklch(100% 0 0 / 0.10)' : 'transparent',
              transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {p.label}
          </a>
        );
      })}
      {adminHref ? (
        <a
          href={adminHref}
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 'var(--text-sm, 13px)',
            fontWeight: 500,
            color: 'oklch(100% 0 0 / 0.66)',
            textDecoration: 'none',
            padding: '5px 13px',
            borderRadius: 'var(--radius-full, 999px)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
          }}
        >
          Admin
        </a>
      ) : null}
      {settingsHref ? (
        <a
          href={settingsHref}
          aria-label="Settings"
          title="Settings"
          style={{
            marginLeft: adminHref ? 4 : 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: 'var(--radius-full, 999px)',
            color: 'oklch(100% 0 0 / 0.66)',
            fontSize: 15,
            lineHeight: 1,
            textDecoration: 'none',
            transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.76 1 1.4 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      ) : null}
      {profileHref ? (
        <a
          href={profileHref}
          aria-label={priorityStatus ? `Profile — ${priorityStatus.label}` : "Profile"}
          title={priorityStatus ? priorityStatus.label : "Profile"}
          style={{
            marginLeft: adminHref || settingsHref ? 4 : 'auto',
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: priorityStatus ? 34 : 30,
            height: priorityStatus ? 34 : 30,
            flexShrink: 0,
            textDecoration: 'none',
            transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
          }}
        >
          {priorityStatus ? (
            // Track + fill, same construction as grove.tsx's ScoreRing:
            // strokeDasharray = filled arc length, remaining circumference.
            // Colour is severity (critical beats important beats complete),
            // fill is plain completion percent - the two are deliberately
            // independent, see this prop's own doc comment on AppNavProps.
            // No text anywhere on this - critical/important/complete are
            // colour plus (for critical) the badge below, never a word.
            <svg width="34" height="34" viewBox="0 0 34 34" style={{ position: 'absolute', inset: 0 }} aria-hidden>
              <circle cx="17" cy="17" r="15" fill="none" stroke="oklch(100% 0 0 / 0.18)" strokeWidth="2.5" />
              <circle
                cx="17" cy="17" r="15" fill="none"
                stroke={
                  priorityStatus.state === 'critical' ? 'var(--danger)'
                    : priorityStatus.state === 'important' ? 'var(--warn)'
                    : 'var(--good)'
                }
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 15 * (priorityStatus.percent / 100)} ${2 * Math.PI * 15}`}
                transform="rotate(-90 17 17)"
                style={{ transition: 'stroke-dasharray 500ms cubic-bezier(.2,.8,.3,1)' }}
              />
            </svg>
          ) : null}
          {priorityStatus?.state === 'critical' ? (
            // The critical badge: a plain "!" in a filled circle, no word
            // anywhere near it - this is the whole indicator for "at least
            // one critical item outstanding," not a decoration on top of one.
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: '999px',
                background: 'var(--danger)',
                border: '1.5px solid var(--brand-800, #1A3F5C)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1,
                color: '#fff',
              }}
            >
              !
            </span>
          ) : null}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-full, 999px)',
              border: initials ? '1.5px solid oklch(100% 0 0 / 0.5)' : 'none',
              // White at full opacity, not the 66%-opacity white every other
              // icon in this bar uses - two-letter bold text at 12px reads
              // much lower-contrast than a line-art glyph at the same
              // opacity, and this is still against the same --brand-800 bar
              // background every other icon here is already verified against.
              color: initials ? '#fff' : 'oklch(100% 0 0 / 0.66)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}
          >
            {initials ?? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            )}
          </span>
        </a>
      ) : null}
      {signOutHref ? (
        <a
          href={signOutHref}
          aria-label="Sign out"
          title="Sign out"
          style={{
            marginLeft: priorityStatus ? 8 : adminHref || settingsHref || profileHref ? 4 : 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: 'var(--radius-full, 999px)',
            color: 'oklch(100% 0 0 / 0.66)',
            textDecoration: 'none',
            transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </a>
      ) : null}
    </nav>
  );
}
