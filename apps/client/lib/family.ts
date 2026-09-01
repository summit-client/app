/**
 * The family a signed-in parent can see.
 *
 * One query against `my_family` (migration 0041), which resolves the children,
 * the household and the permissions held over each. Not assembled from four
 * queries in the page: the permission join is the part that is easy to get
 * subtly wrong, and getting it wrong in one screen out of eight is how a family
 * sees a sibling's billing.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is UX. `permissions` here decides what the portal OFFERS: a parent
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
}

export function familyFromRows(rows: MyFamilyRow[]): Family {
  const children: FamilyChild[] = rows.map((r) => ({
    clientId: Number(r.client_id),
    name: r.client_name,
    preferredName: r.preferred_name,
    status: r.client_status ?? "active",
    dateOfBirth: r.date_of_birth,
    permissions: (r.permissions ?? []) as GuardianPermission[],
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

/* ---- which child the parent was last looking at --------------------------
 * Remembered per signed-in user, not globally: a shared family computer would
 * otherwise open on the other parent's last child. Still only a hint — the
 * value is validated against the family the server returned before it is used,
 * so a stale or edited entry cannot select a child the parent cannot see.
 */

const KEY_PREFIX = "summit-family-view";

/**
 * The cookie name is duplicated from lib/admin-view-as.ts rather than imported.
 * That file pulls in next and @supabase/supabase-js types, and this module is
 * compiled standalone by tests/family.test.mjs; importing it would drag the
 * server world into a browser module for one string.
 */
const VIEWED_CHILD_COOKIE = "summit_viewed_child";

export function rememberView(userId: string, view: FamilyView): void {
  try {
    localStorage.setItem(
      `${KEY_PREFIX}:${userId}`,
      view.kind === "family" ? "family" : String(view.clientId),
    );
  } catch {
    /* private mode, or storage disabled. The portal still works, it just
       opens on the default view each time. */
  }

  // The same choice, where the server can see it. Pages rendered in
  // getServerSideProps resolve a child through resolveViewedClient, which
  // cannot read localStorage - without this a parent who switches to their
  // second child is switched back by the next server-rendered page.
  //
  // Not a grant: the value is validated against `my_family` on the server, so
  // a hand-edited cookie reaches nothing new. SameSite=Lax because it only
  // ever needs to survive ordinary navigation within this portal.
  try {
    const value = view.kind === "family" ? "" : String(view.clientId);
    document.cookie =
      `${VIEWED_CHILD_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  } catch {
    /* No document (server render, or a test importing this module). The
       localStorage half above is what the client-rendered switcher reads. */
  }
}

export function recallView(userId: string, family: Family): FamilyView {
  let stored: string | null = null;
  try { stored = localStorage.getItem(`${KEY_PREFIX}:${userId}`); } catch { /* as above */ }

  if (stored === "family") return { kind: "family" };

  const id = stored == null ? NaN : Number(stored);
  if (Number.isFinite(id) && family.children.some((c) => c.clientId === id)) {
    return { kind: "child", clientId: id };
  }

  // Default: a single child opens on that child, since Family View of one
  // person is just the child's page with an extra click in front of it.
  // Several children open on Family View, which is the honest answer to
  // "what is happening today" when the parent has not chosen.
  if (family.children.length === 1) return { kind: "child", clientId: family.children[0].clientId };
  return { kind: "family" };
}
