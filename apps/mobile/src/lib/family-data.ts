/**
 * What the phone reads, and why it reads it this way.
 *
 * A guardian's access is keyed on `auth.uid()` through `guardian_relationships`
 * — NOT on `profiles.role` or `profiles.clinic_id`, which every web portal
 * gates on and which a parent may not have at all. The test guardian in
 * production has no `profiles` row, so `auth_role()` is null for them.
 *
 * That is why nothing here embeds a join:
 *
 *   - `staff` admits no guardian under any policy. `staff(name)` would come
 *     back null and the screen would quietly say a session has no clinician.
 *     Clinician names come from `my_care_team()`, a security-definer function
 *     written for families (migration 0056).
 *   - `locations` and `session_types` are readable only when
 *     `auth_role()` is one of scheduler/client/clinician. A guardian without a
 *     `profiles` row gets neither, so the session's own `type` text column is
 *     used for the service name — it is on the row already and needs no join.
 *
 * RLS is the boundary, and it answers a refused read with an EMPTY SET rather
 * than an error. Every function here therefore reports what it could not see,
 * so a screen can say "your access does not include this" instead of rendering
 * an empty list that reads as "nothing is scheduled".
 */
import { familyFromRows, type Family, type FamilyChild, clinicTodayDateStr } from "@summit/family";

import { supabase } from "./supabase";

export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/** The children this parent may see, with the permissions held over each. */
export async function loadFamily(): Promise<LoadResult<Family>> {
  const { data, error } = await supabase
    .from("my_family")
    .select(
      "client_id, client_name, client_status, preferred_name, date_of_birth, household_id, household_name, permissions, clinic_id",
    );

  // error.message only — a Supabase error can carry `details`/`hint` quoting
  // the row it failed on, which is a child's record.
  if (error) return { ok: false, reason: error.message };
  return { ok: true, value: familyFromRows(data ?? []) };
}

export type UpcomingSession = {
  id: number;
  clientId: number;
  date: string;
  hour: number | null;
  minute: number | null;
  /** The service name, off the session row rather than through a join. */
  type: string | null;
  status: string | null;
  isHomeVisit: boolean;
};

/**
 * Sessions from today onward, in the clinic's calendar day rather than this
 * phone's. A parent in another timezone must see the same "today" the clinic
 * does, which is the whole reason `clinicTodayDateStr` is shared rather than
 * reimplemented here.
 *
 * Cancelled sessions are excluded, matching the web portal. A cancelled
 * session is not something a parent needs to plan around.
 */
export async function loadUpcomingSessions(
  clientId: number,
): Promise<LoadResult<UpcomingSession[]>> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, client_id, session_date, hour, minute, type, status, is_home_visit")
    .eq("client_id", clientId)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (error) return { ok: false, reason: error.message };
  return {
    ok: true,
    value: (data ?? []).map((r) => ({
      id: Number(r.id),
      clientId: Number(r.client_id),
      date: String(r.session_date),
      hour: r.hour == null ? null : Number(r.hour),
      minute: r.minute == null ? null : Number(r.minute),
      type: r.type ?? null,
      status: r.status ?? null,
      isHomeVisit: Boolean(r.is_home_visit),
    })),
  };
}

export type CareTeamMember = { clientId: number; name: string; jobTitle: string | null };

/**
 * Who sees this child. The only route to a clinician's name that a guardian
 * has — `staff` itself refuses them.
 */
export async function loadCareTeam(): Promise<LoadResult<CareTeamMember[]>> {
  const { data, error } = await supabase.rpc("my_care_team");
  if (error) return { ok: false, reason: error.message };
  return {
    ok: true,
    value: (data ?? []).map((r: Record<string, unknown>) => ({
      clientId: Number(r.client_id),
      name: String(r.staff_name ?? ""),
      jobTitle: (r.staff_role as string | null) ?? null,
    })),
  };
}

/**
 * Why a list is empty, said out loud.
 *
 * The trap this exists for: a parent who does not hold `view_appointments`
 * gets an empty array from the database, not a refusal. Without this the screen
 * says "nothing scheduled" to someone whose child has sessions every week.
 */
export function explainEmpty(
  child: FamilyChild | null,
  permission: "view_appointments" | "view_clinical_progress",
  what: string,
): string {
  if (!child) return `No child is linked to this account yet.`;
  if (!child.permissions.includes(permission)) {
    return `Your access to ${child.preferredName?.trim() || child.name}'s record does not include ${what}. The clinic sets this.`;
  }
  return `Nothing ${what === "appointments" ? "scheduled" : "recorded"} yet.`;
}
