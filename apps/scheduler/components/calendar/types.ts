export interface CalSession {
  id: number;
  client_id: number;
  employee_id: number;
  calendar_id: number | null;
  session_date: string;
  hour: number;
  minute: number;
  type: string;
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
  const st = sessionTypes.find((t) => t.name === session.type);
  return (st?.duration_minutes ?? st?.duration ?? 60) as number;
}

export function findSessionType(session: CalSession, sessionTypes: CalSessionType[]): CalSessionType | undefined {
  return sessionTypes.find((t) => t.name === session.type);
}

/** The snap/scheduling increment for one session: its own type's override if
 *  set, else the org-wide default passed in by the caller. */
export function sessionGridIncrement(session: CalSession | undefined, sessionTypes: CalSessionType[], orgDefaultMinutes: number): number {
  if (!session) return orgDefaultMinutes;
  const st = findSessionType(session, sessionTypes);
  return st?.grid_increment_minutes ?? orgDefaultMinutes;
}
