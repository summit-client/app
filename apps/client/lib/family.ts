/**
 * The family a signed-in parent can see — plus the one part of it that needs a
 * browser.
 *
 * Everything about WHO the children are and WHAT may be shown of each now lives
 * in `@summit/family`, so `apps/mobile` answers those questions with this exact
 * code rather than its own. Re-exported here because ten pages import them from
 * this path and moving those imports would be churn, not a change.
 *
 * What stays: remembering which child was last viewed. That needs
 * `localStorage` and a cookie the server can read, neither of which exists on a
 * phone.
 */
export type {
  GuardianPermission,
  FamilyChild,
  Family,
  FamilyView,
} from "@summit/family";
export {
  displayName,
  ageOf,
  can,
  canForAny,
  childById,
  familyFromRows,
  defaultView,
} from "@summit/family";

import type { Family, FamilyView } from "@summit/family";
import { defaultView } from "@summit/family";

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

  // Nothing remembered, or what was remembered is no longer a child this
  // parent can see. The default is shared with the phone, which has no
  // localStorage to remember a choice in at all.
  return defaultView(family);
}
