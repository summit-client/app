/**
 * The family a signed-in parent can see.
 *
 * One query against `my_family` (migration 0047), which resolves the children,
 * the household and the permissions held over each. Not assembled from four
 * queries in the page: the permission join is the part that is easy to get
 * subtly wrong, and getting it wrong in one screen out of eight is how a family
 * sees a sibling's billing.
 *
 * Extracted from apps/client so apps/mobile answers these questions with the
 * same code rather than its own. Nothing here touches the DOM, a browser API,
 * Supabase or `next/*` - that is what lets React Native consume it. Remembering
 * which child was last viewed needs a browser and stays in apps/client.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is UX. `permissions` here decides what a portal OFFERS: a parent
 * without billing access should not be shown an invoices tab that would fail.
 * It is not the enforcement point. RLS is, and the tests in supabase/tests
 * assert that a parent who edits the URL, or the request, still gets nothing.
 * If this file and the database ever disagree, the database is right.
 */

export type GuardianPermission =
  | "view_profile"
  | "edit_demographics"
  | "view_appointments"
  | "manage_appointments"
  | "view_forms"
  | "complete_forms"
  | "view_clinical_progress"
  | "view_shared_documents"
  | "view_billing"
  | "manage_payment_methods"
  | "pay_invoices"
  | "message_clinic"
  | "receive_clinical_notifications"
  | "receive_financial_notifications"
  | "manage_household"
  | "view_family_contacts";

export interface FamilyChild {
  clientId: number;
  name: string;
  /** What the family calls them, where it differs from the legal name. */
  preferredName: string | null;
  status: string;
  dateOfBirth: string | null;
  permissions: GuardianPermission[];
  /** Needed for writes scoped to this child (home_session_preferences,
   *  client_availability) - both require clinic_id on the row. Nullable
   *  only because the test fixture rows don't carry it; a real `my_family`
   *  row always does. */
  clinicId: string | null;
}

export interface Family {
  householdId: string | null;
  householdName: string | null;
  children: FamilyChild[];
}

/** What the switcher is currently pointed at: one child, or the whole family. */
export type FamilyView =
  | { kind: "child"; clientId: number }
  | { kind: "family" };

/** The display name, preferring what the family actually calls the child. */
export function displayName(child: FamilyChild): string {
  return child.preferredName?.trim() || child.name;
}

/** Age in whole years, or null when no date of birth is recorded. */
export function ageOf(child: FamilyChild, today = new Date()): number | null {
  if (!child.dateOfBirth) return null;
  // Parsed as a local calendar date, not an instant. `new Date("2019-06-30")`
  // is UTC midnight and reads back as the 29th anywhere west of UTC, which
  // takes a year off a child whose birthday is today.
  const [y, m, d] = child.dateOfBirth.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function can(child: FamilyChild | null, permission: GuardianPermission): boolean {
  return !!child && child.permissions.includes(permission);
}

/**
 * A permission across the whole family.
 *
 * `some`, not `every`: the Messages tab should appear when a parent can message
 * about at least one child. The per-child check is what gates the action once
 * they are inside it.
 */
export function canForAny(family: Family, permission: GuardianPermission): boolean {
  return family.children.some((c) => c.permissions.includes(permission));
}

export function childById(family: Family, clientId: number | null): FamilyChild | null {
  if (clientId == null) return null;
  return family.children.find((c) => c.clientId === clientId) ?? null;
}

/** Row shape of the `my_family` view. */
interface MyFamilyRow {
  client_id: number | string;
  client_name: string;
  client_status: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  household_id: string | null;
  household_name: string | null;
  permissions: string[] | null;
  clinic_id?: string | null;
}

export function familyFromRows(rows: MyFamilyRow[]): Family {
  const children: FamilyChild[] = rows.map((r) => ({
    clientId: Number(r.client_id),
    name: r.client_name,
    preferredName: r.preferred_name,
    status: r.client_status ?? "active",
    dateOfBirth: r.date_of_birth,
    permissions: (r.permissions ?? []) as GuardianPermission[],
    clinicId: r.clinic_id ?? null,
  }));

  // Sorted by name so the switcher does not reorder between loads. Postgres
  // gives no ordering guarantee without an ORDER BY, and a switcher whose
  // children swap places is one a parent stops trusting.
  children.sort((a, b) => displayName(a).localeCompare(displayName(b)));

  return {
    householdId: rows[0]?.household_id ?? null,
    householdName: rows[0]?.household_name ?? null,
    children,
  };
}

/**
 * Which view to open on when nothing has been remembered.
 *
 * A single child opens on that child, since Family View of one person is just
 * the child's page with an extra click in front of it. Several children open on
 * Family View, which is the honest answer to "what is happening today" when the
 * parent has not chosen.
 *
 * Shared because the phone has no localStorage to remember a choice in, so this
 * is the only selection rule it has - and it must match what the web opens on.
 */
export function defaultView(family: Family): FamilyView {
  if (family.children.length === 1) return { kind: "child", clientId: family.children[0].clientId };
  return { kind: "family" };
}
