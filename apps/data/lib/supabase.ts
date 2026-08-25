/**
 * Re-export only -- deliberately not a second createBrowserClient call.
 *
 * This app already reaches Supabase through '@summit/db' (see
 * lib/behaviour-tracking/service.ts). A second browser client in the same
 * document shares the storage key, the auth Web Lock and the refresh ticker
 * with the first: they contend on every auth call and the page can deadlock on
 * a permanent "Loading...". The scheduler shipped that bug; do not re-add it.
 *
 * Configuration (cookie domain, lockAcquireTimeout) lives in packages/db.
 */
export { supabase } from "@summit/db";
