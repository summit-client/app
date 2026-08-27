/**
 * Where each `profiles.role` lands after sign-in.
 *
 * Both the map and the URLs come from @summit/portals now, so this file no
 * longer holds a second copy of either. It used to hold both: four URL
 * constants the portal bar hardcoded independently, and a role map that sent
 * `staff` — not a role the database issues — to the employee portal while
 * omitting `supervisor` entirely.
 *
 * See `homePortal` in the registry for why clinical roles land in the clinician
 * portal and MySummitHR is nobody's landing page.
 */

import { APP_ROLES, homeUrlFor } from '@summit/portals'

export { homeUrlFor }

/** Every role's landing URL, resolved for this environment. */
export const ROLE_REDIRECTS: Record<string, string> = Object.fromEntries(
  APP_ROLES.map((role) => [role, homeUrlFor(role)]),
)

/** Falls back to the scheduler for a role the registry does not know. */
export function redirectForRole(role?: string | null) {
  return homeUrlFor(role)
}
