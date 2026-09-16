/**
 * Which `staff` rows are people who actually deliver sessions.
 *
 * Every staff-shaped invite mints a `staff` row - supabase/functions/
 * invite-teammate inserts one for admin, supervisor, clinician AND
 * scheduler alike - so the staff table is not a clinician roster, it is an
 * everyone-who-works-here roster. Capacity and utilization displays that
 * treat it as the former end up reporting an office manager as 0/0 booked,
 * which is both noise and (before the guard below) a NaN%.
 *
 * `staff.role` is the CLINICAL CREDENTIAL (BCBA | BCaBA | RBT |
 * Supervisor), not `profiles.role` - CLAUDE.md is emphatic about not
 * confusing the two, and this module only ever reads the former.
 *
 * The rule is deliberately two-sided, because neither half is sufficient:
 *  - credential set  -> a clinician, even if nobody has given them capacity
 *    yet. (A brand-new hire should appear so an admin can configure them.)
 *  - capacity > 0    -> somebody has deliberately configured this person to
 *    carry sessions, so they belong in the capacity picture whatever their
 *    credential says. This is what rescues clinicians invited through
 *    apps/employee's InviteForm, which leaves `staff.role` null for
 *    everyone - a strict credential test would hide every one of them.
 * Neither matches an invited admin/scheduler, who has null role and 0
 * capacity until someone makes them a clinician on purpose.
 */

export const CLINICAL_CREDENTIALS = ["BCBA", "BCaBA", "RBT", "Supervisor"] as const;

export interface CapacityStaff {
  role?: string | null;
  capacity?: number | null;
}

export function isClinicalStaff(member: CapacityStaff | null | undefined): boolean {
  if (!member) return false;
  const credential = (member.role || "").trim();
  if (CLINICAL_CREDENTIALS.some((r) => r.toLowerCase() === credential.toLowerCase())) return true;
  return (member.capacity ?? 0) > 0;
}

/** Utilization as a 0-1 fraction, never NaN. `capacity` is nullable in the
 *  schema with no default, and invite-teammate writes 0 - both of which used
 *  to reach a bare `booked / capacity` and render "NaN%". */
export function utilization(member: { booked?: number | null; capacity?: number | null } | null | undefined): number {
  const capacity = member?.capacity ?? 0;
  if (capacity <= 0) return 0;
  return Math.min(1, (member?.booked ?? 0) / capacity);
}

/** True when this person has room for another session. Used as a booking
 *  eligibility predicate, so a null/0 capacity correctly means "not
 *  bookable" rather than "infinitely bookable". */
export function hasOpenCapacity(member: { booked?: number | null; capacity?: number | null } | null | undefined): boolean {
  const capacity = member?.capacity ?? 0;
  return capacity > 0 && (member?.booked ?? 0) < capacity;
}
