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
}

export function sessionDuration(session: CalSession, sessionTypes: CalSessionType[]): number {
  const st = sessionTypes.find((t) => t.name === session.type);
  return (st?.duration_minutes ?? st?.duration ?? 60) as number;
}
