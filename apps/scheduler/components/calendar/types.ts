export interface CalSession {
  id: number;
  /** Nullable for two different reasons, and the app has to tell them apart.
   *  A staff block (Break/Lunch/Meeting - migration 0078) genuinely has no
   *  client. A row read through `sessions_visible()` (migration 0077) has it
   *  NULLed because this viewer may not see WHOSE session it is; that case
   *  and only that case sets `client_masked`. See lib/sessionPrivacy.ts. */
  client_id: number | null;
  /** True when `sessions_visible()` withheld client_id (and home_address) on
   *  this row. Absent on rows read straight from the `sessions` table, which
   *  are the viewer's own and never masked. */
  client_masked?: boolean;
  employee_id: number;
  calendar_id: number | null;
  session_date: string;
  hour: number;
  minute: number;
  /** The session type's NAME. Display data: it is what the catalogue was
   *  called when this row was last written, kept in agreement with
   *  `session_type_id` by migration 0085's triggers. Resolve a session to its
   *  type through `findSessionType()`, never by matching this. */
  type: string;
  /** The session type this session IS (migration 0085). Null on a row written
   *  before 0085 whose name matched no catalogue entry, or whose type has
   *  since been deleted - `findSessionType()` falls back to the name there. */
  session_type_id?: number | null;
  status: string;
  recurrence_id: string | null;
  location_id: number | null;
  is_home_visit: boolean;
  home_address: string | null;
}

export interface CalClient {
  id: number;
  name: string;
  location_id: number | null;
  address?: string | null;
}

export interface CalEmployee {
  id: number;
  name: string;
  location_id: number | null;
}

export interface CalLocation {
  id: number;
  name: string;
  address?: string | null;
}

export interface CalSessionType {
  id: number;
  name: string;
  color?: string;
  duration?: number;
  duration_minutes?: number;
  gap_before_minutes?: number;
  gap_after_minutes?: number;
  /** Null/undefined means "use the org's calendar.gridIncrementMinutes
   *  default" - a session type only needs this set when its own duration
   *  doesn't divide evenly into that default (e.g. a 63-minute type on a
   *  15-minute grid). */
  grid_increment_minutes?: number | null;
  is_client_optional?: boolean;
}

export function sessionDuration(session: CalSession, sessionTypes: CalSessionType[]): number {
  const st = findSessionType(session, sessionTypes);
  return (st?.duration_minutes ?? st?.duration ?? 60) as number;
}

/**
 * The catalogue row a session belongs to.
 *
 * By id, because a name is display data: an admin may rename a session type,
 * and before migration 0085 a rename silently detached every session booked
 * under the old name - the duration fell back to 60 minutes (which is what
 * made 0045's double-booking check stop catching real clashes), the colour
 * fell to grey, and the billing join found no rate.
 *
 * The name fallback is not belt-and-braces, it is the real case for two kinds
 * of row: one written before 0085 whose `type` matched nothing in its clinic's
 * catalogue, so the backfill left `session_type_id` null; and one whose type
 * has since been deleted, which clears the pointer and keeps the label
 * (`on delete set null`). Both still want their best available answer.
 */
export function findSessionType(session: CalSession, sessionTypes: CalSessionType[]): CalSessionType | undefined {
  if (session.session_type_id != null) {
    const byId = sessionTypes.find((t) => t.id === session.session_type_id);
    if (byId) return byId;
  }
  return sessionTypes.find((t) => t.name === session.type);
}

/** The snap/scheduling increment for one session: its own type's override if
 *  set, else the org-wide default passed in by the caller. */
export function sessionGridIncrement(session: CalSession | undefined, sessionTypes: CalSessionType[], orgDefaultMinutes: number): number {
  if (!session) return orgDefaultMinutes;
  const st = findSessionType(session, sessionTypes);
  return st?.grid_increment_minutes ?? orgDefaultMinutes;
}
