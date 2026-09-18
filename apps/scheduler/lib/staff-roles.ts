/**
 * Which `staff` rows are people who actually carry sessions.
 *
 * Every staff-shaped invite mints a `staff` row - supabase/functions/
 * invite-teammate inserts one for admin, supervisor, clinician AND
 * scheduler alike - so the staff table is not a clinician roster, it is an
 * everyone-who-works-here roster. Capacity and utilization displays that
 * treat it as the former end up reporting an office manager as 0/0 booked,
 * which is both noise and (before the guard below) a NaN%.
 *
 * THIS USED TO ASK A SECOND QUESTION AND NO LONGER DOES. The rule was
 * two-sided: a clinical credential in `staff.role`, OR capacity > 0. Migration
 * 0086 retired `staff.role` - it was free text typed into a scheduling screen,
 * a fourth copy of a vocabulary that already existed three times over, and
 * nothing ever verified it. Credentials now live in `employee_credentials`,
 * in one place, confirmed by a named person against the issuer's register.
 *
 * The credential half is not re-fetched here, deliberately. `employee_credentials`
 * is readable clinic-wide only to someone `hub_can_manage()` admits; a
 * clinician reads their OWN row and nobody else's. A roster filter built on it
 * would answer differently depending on who was looking at the calendar -
 * which is the "RLS returns empty sets, not errors" trap in a new coat. The
 * scheduler's question is "can this person carry a session", and the honest
 * answer to that is capacity, which is clinic-wide readable and is already
 * what `hasOpenCapacity` requires before anything can be booked.
 *
 * So the function is renamed to what it now tests. Nobody's bookability
 * changed at 0086: staff configured through the scheduler's admin page carry
 * capacity 20, and staff created by `invite-teammate` had null role and 0
 * capacity, so they were already false on BOTH halves.
 */

export interface CapacityStaff {
  capacity?: number | null;
}

/** True when somebody has deliberately configured this person to carry
 *  sessions. See this module's header for why the credential half is gone. */
export function carriesSessions(member: CapacityStaff | null | undefined): boolean {
  return (member?.capacity ?? 0) > 0;
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
