const SCHEDULER = process.env.NEXT_PUBLIC_URL_SCHEDULER ?? 'https://scheduler.summitclient.io'
const DATA      = process.env.NEXT_PUBLIC_URL_DATA      ?? 'https://data.summitclient.io'
const EMPLOYEE  = process.env.NEXT_PUBLIC_URL_EMPLOYEE  ?? 'https://employee.summitclient.io'
const CLIENT    = process.env.NEXT_PUBLIC_URL_CLIENT    ?? 'https://client.summitclient.io'

/**
 * The portal URLs, environment-overridable. `packages/nav/src/portals.config.ts`
 * hardcodes the same four with no override, so the platform encodes this map
 * twice — set NEXT_PUBLIC_URL_EMPLOYEE and sign-in honours it while the portal
 * bar does not. Exported so there is somewhere for nav to read from when that
 * gets unified.
 */
export const PORTAL_URLS = { SCHEDULER, DATA, EMPLOYEE, CLIENT } as const

/**
 * Where each `profiles.role` lands after sign-in. Keys are the vocabulary
 * migration 0001 defines on the column — nothing else is a role.
 *
 * This used to send `staff` to the employee portal. `staff` is not a role the
 * database issues, and apps/employee has no mapping for it, so the one role
 * pointed at that portal would have been turned away by it. `supervisor` was
 * missing entirely and fell through to the scheduler.
 *
 * Clinical roles land in the clinician portal because that is their daily work
 * — caseload, review queue, supervision. MySummitHR is where they go for
 * onboarding, training and time off, which is a visit rather than a home, so
 * it is reached from the portal bar rather than being anyone's landing page.
 */
export const ROLE_REDIRECTS: Record<string, string> = {
  admin:      SCHEDULER,
  scheduler:  SCHEDULER,
  supervisor: DATA,
  clinician:  DATA,
  client:     CLIENT,
}

export function redirectForRole(role?: string | null) {
  return (role && ROLE_REDIRECTS[role]) || SCHEDULER
}
