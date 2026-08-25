/**
 * Re-export only -- deliberately not a second createBrowserClient call.
 *
 * Every entry point in this app (lib/useUser, pages/login, pages/admin) must
 * resolve to ONE client instance. pages/login and pages/admin import
 * '@summit/db' directly; this file makes '../lib/supabase' the same module.
 *
 * Configuration lives in packages/db/index.ts.
 */
export { supabase } from "@summit/db";
