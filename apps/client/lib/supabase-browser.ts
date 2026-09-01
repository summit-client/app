import { createBrowserClient } from "@supabase/ssr";

/**
 * The one browser-side Supabase client this app creates directly. Every
 * other read in apps/client runs server-side (getServerSideProps, via
 * lib/supabase-server.ts) - this app had "no forms or mutations anywhere"
 * until the document upload this file backs (see lib/admin-view-as.ts's
 * header comment), so there was previously nothing that needed to call
 * Supabase from the browser at all.
 *
 * No cookie overrides, same as @summit/session's own browser client
 * (packages/session/index.ts) - that package already proves this shape
 * reads the shared `.summitclient.io` session cookie correctly from every
 * portal in this family, so this does not reinvent it.
 *
 * Anon key only, same as every other client in this repo - the service role
 * key never belongs in a browser bundle (root CLAUDE.md's hard constraints).
 * Storage and table access from this client are gated entirely by RLS
 * (client_documents' policies, migration 0035) and the Storage bucket
 * policies a human still needs to add - see that migration's own footer.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
