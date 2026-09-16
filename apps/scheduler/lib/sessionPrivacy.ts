/**
 * Who may see WHICH CLIENT a session belongs to.
 *
 * A clinician looking at a colleague's calendar sees what the colleague is
 * doing - the session type, the time, that the slot is taken - and not who
 * it is with. Admin and scheduler see everything, as they always have.
 *
 * WHAT THIS IS AND IS NOT, because it matters here more than usual:
 * this is presentation. Migration 0046 gives every clinician clinic-wide
 * SELECT on `sessions` and `clients`, and pages/index.jsx's loadData()
 * pulls both unfiltered into browser state for every role - so the
 * association this module hides is still present in the tab and readable
 * from devtools. Masking the UI is worth doing (it stops the incidental,
 * over-the-shoulder, "I was just looking at the calendar" exposure, which
 * is the realistic one in a clinic) but it is NOT an access control, and
 * nothing here should be described to anyone as one. Closing it properly
 * means narrowing the RLS policy or routing the calendar through a view
 * that never returns client_id for other people's sessions - raised with
 * the account owner separately, deliberately not done unilaterally.
 *
 * The same discipline already exists on the export side: lib/ics.ts and
 * pages/api/calendar/feed/[token].ics.ts never resolve a colleague's client
 * name in the first place. This module is the in-app half of that rule.
 */

export interface PrivacyScopedSession {
  employee_id?: number | null;
  client_id?: number | null;
  location_id?: number | null;
  is_home_visit?: boolean | null;
  home_address?: string | null;
}

export interface PrivacyViewer {
  role?: string | null;
  staffId?: number | null;
}

export const MASKED_CLIENT_LABEL = "Client (private)";
export const MASKED_HOME_LABEL = "Home visit";

/**
 * admin/scheduler: always - unchanged from today.
 * supervisor: always. Clinic-wide supervisory read is this schema's posture
 *   everywhere else, and supervisor cannot actually reach this portal today
 *   (ACCESS.scheduler, packages/portals) - named here so that admitting them
 *   later doesn't silently blind them instead.
 * clinician: their own sessions only - the same test canManageSession()
 *   already applies on the write side, so read and write agree.
 * Anything else, including an identity that hasn't resolved yet
 * (staffId null/undefined - real and expected for a clinician with no
 * linked staff row), masks. Failing closed is the only safe default for a
 * predicate like this.
 */
export function canSeeClientIdentity(
  viewer: PrivacyViewer | null | undefined,
  session: PrivacyScopedSession | null | undefined,
): boolean {
  if (!viewer || !session) return false;
  if (viewer.role === "admin" || viewer.role === "scheduler" || viewer.role === "supervisor") return true;
  if (viewer.role === "clinician") return viewer.staffId != null && session.employee_id === viewer.staffId;
  return false;
}

/**
 * Resolve a session's client for display.
 *
 * Returns `client: undefined` when masked rather than a label the caller is
 * trusted to use - a masked result carries nothing to leak onward, so a
 * component that passes it into a child (SessionDetail into
 * SessionSchedulesPanel) can't accidentally un-mask it.
 */
export function visibleClient<T extends { id: number; name: string }>(
  viewer: PrivacyViewer | null | undefined,
  session: PrivacyScopedSession | null | undefined,
  clients: T[] | null | undefined,
): { client?: T; name: string; masked: boolean } {
  if (!canSeeClientIdentity(viewer, session)) {
    return { client: undefined, name: MASKED_CLIENT_LABEL, masked: true };
  }
  const client =
    session?.client_id != null ? (clients || []).find((c) => c.id === session.client_id) : undefined;
  return { client, name: client?.name ?? "Unknown client", masked: false };
}

/**
 * A home visit's address is client-identifying - more so than the name, since
 * it is where they live. A masked home visit says only that it is one.
 */
export function visibleLocation(
  viewer: PrivacyViewer | null | undefined,
  session: (PrivacyScopedSession & { location_id?: number | null }) | null | undefined,
  locations: { id: number; name: string; address?: string | null }[] | null | undefined,
): { text: string; title: string; masked: boolean } {
  const masked = !canSeeClientIdentity(viewer, session);
  if (session?.is_home_visit) {
    if (masked) return { text: MASKED_HOME_LABEL, title: MASKED_HOME_LABEL, masked: true };
    const addr = session.home_address || MASKED_HOME_LABEL;
    return { text: addr, title: addr, masked: false };
  }
  const loc = (locations || []).find((l) => l.id === session?.location_id);
  return { text: loc?.name || "—", title: loc?.address || loc?.name || "No location set", masked };
}

/**
 * The primary label on a calendar block or chip: the client's name when the
 * viewer may see it, the session TYPE when not. "Session types only across
 * staff" - a colleague's calendar still reads as a real working day, it just
 * doesn't name anyone.
 */
export function sessionPrimaryLabel<T extends { id: number; name: string }>(
  viewer: PrivacyViewer | null | undefined,
  session: (PrivacyScopedSession & { type?: string | null }) | null | undefined,
  clients: T[] | null | undefined,
): string {
  const { name, masked } = visibleClient(viewer, session, clients);
  if (!masked) return name;
  return session?.type || MASKED_CLIENT_LABEL;
}
