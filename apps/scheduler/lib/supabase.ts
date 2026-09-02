/**
 * Re-export only -- deliberately not a second createBrowserClient call.
 *
 * Every entry point in this app (lib/useUser, pages/admin) must resolve to
 * ONE client instance. pages/admin imports '@summit/db' directly; this file
 * makes '../lib/supabase' the same module. There is no local pages/login
 * anymore -- sign-in is apps/web's /login, same as every other portal
 * (see proxy.ts).
 *
 * Configuration lives in packages/db/index.ts.
 */
export { supabase } from "@summit/db";
