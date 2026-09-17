/**
 * Who may see WHICH CLIENT a session belongs to.
 *
 * A clinician looking at a colleague's calendar sees what the colleague is
 * doing - the session type, the time, that the slot is taken - and not who
 * it is with. Admin and scheduler see everything, as they always have.
 *
 * THE DATABASE IS NOW THE BOUNDARY, AND THIS IS ITS UI HALF.
 *
 * When this module was first written it was presentation only: migration
 * 0014 gave every clinician clinic-wide SELECT on `sessions`, loadData()
 * pulled the lot unfiltered into browser state for every role, and the mask
 * was paint over a payload one devtools Network tab away. Migration 0077
 * closed that at the source - a clinician's direct read of `sessions` is
 * their own rows, and colleague occupancy comes from
 * `public.sessions_visible()`, which returns the row with `client_id` and
 * `home_address` already NULL and `client_masked = true` on anything they
 * may not associate.
 *
 * So the client id this module used to hide is no longer in the tab at all.
 * What is left for this file to do is render that fact correctly, and the
 * one thing it must not get wrong is the difference between the two
 * reasons `client_id` can be null:
 *
 *   client_masked = true    there is somebody here you may not see
 *   client_id null, no flag there is nobody - a staff block (Break/Lunch/
 *                           Meeting, migration 0078), or a session with no
 *                           client assigned yet
 *
 * Showing "No client" over a colleague's real appointment, or "Client
 * (private)" over a lunch break, are both wrong and in opposite directions.
 * The predicate below is still evaluated independently of the flag rather
 * than trusting it alone: rows read straight from the `sessions` table
 * carry no flag at all (they are the viewer's own, and never masked), and a
 * viewer-side test is what keeps those rendering correctly.
 *
 * The same discipline already exists on the export side: lib/ics.ts and
 * pages/api/calendar/feed/[token].ics.ts never resolve a colleague's client
 * name in the first place. This module is the in-app half of that rule.
 */

export interface PrivacyScopedSession {
  employee_id?: number | null;
  client_id?: number | null;
  /** Set by `sessions_visible()` (migration 0077) when it withheld this
   *  row's client_id. Absent means "not masked", never "unknown" - the only
   *  rows that reach this module without the column are ones read straight
   *  from `sessions`, which after 0077 are the viewer's own. */
  client_masked?: boolean | null;
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
/** A staff-only block (Break/Lunch/Meeting - session_types
 *  .is_client_optional) genuinely has no client. Distinct from the masked
 *  label on purpose: "there is nobody to name" and "there is somebody you
 *  may not see" are different facts, and showing the masked wording for a
 *  lunch break would imply a hidden client that does not exist. */
export const NO_CLIENT_LABEL = "No client";

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
  // The database already decided this one. `sessions_visible()` reveals a
  // colleague's client when the caller demonstrably works with that client
  // too (see migration 0077's header on why that discloses nothing new) -
  // a case the viewer-side test below cannot see, since it knows only who
  // the session belongs to. Honour the flag when the row carries it.
  if (session.client_masked === true) return false;
  if (session.client_masked === false && session.client_id != null) return true;
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
  // Checked before the permission test: a session with no client has no
  // identity to protect, so masking one would be noise - and for a staff
  // block it would be actively misleading. `client_masked` is what keeps
  // this from swallowing a colleague's real session, whose client_id
  // `sessions_visible()` has also set to null but for the opposite reason.
  if (session && session.client_id == null && session.client_masked !== true) {
    return { client: undefined, name: NO_CLIENT_LABEL, masked: false };
  }
  if (!canSeeClientIdentity(viewer, session)) {
    return { client: undefined, name: MASKED_CLIENT_LABEL, masked: true };
  }
  const client = (clients || []).find((c) => c.id === session?.client_id);
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
  // A staff block's type IS its label - "Lunch", not "No client". Same
  // client_masked guard as visibleClient(): a masked row falls through to
  // the permission test below, which reaches the same "show the type"
  // answer by the right route and reports masked: true on the way.
  if (session && session.client_id == null && session.client_masked !== true) {
    return session.type || NO_CLIENT_LABEL;
  }
  const { name, masked } = visibleClient(viewer, session, clients);
  if (!masked) return name;
  return session?.type || MASKED_CLIENT_LABEL;
}
