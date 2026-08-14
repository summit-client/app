const SCHEDULER = process.env.NEXT_PUBLIC_URL_SCHEDULER ?? 'https://scheduler.summitclient.io'
const DATA      = process.env.NEXT_PUBLIC_URL_DATA      ?? 'https://data.summitclient.io'
const EMPLOYEE  = process.env.NEXT_PUBLIC_URL_EMPLOYEE  ?? 'https://employee.summitclient.io'
const CLIENT    = process.env.NEXT_PUBLIC_URL_CLIENT    ?? 'https://client.summitclient.io'

export const ROLE_REDIRECTS: Record<string, string> = {
  admin:     SCHEDULER,
  scheduler: SCHEDULER,
  clinician: DATA,
  staff:     EMPLOYEE,
  client:    CLIENT,
}

export function redirectForRole(role?: string | null) {
  return (role && ROLE_REDIRECTS[role]) || SCHEDULER
}
