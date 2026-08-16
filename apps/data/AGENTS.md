# apps/data Agent Notes

- apps/data uses the Next.js App Router.
- Authentication at the route boundary follows the existing server Supabase pattern used in apps/web/lib/supabase-server.ts.
- Server-side authorization checks use supabase.auth.getUser(), not getSession().
- Behaviour tracking client-side queries continue to use the existing @summit/db browser client.
- Data authorization/scoping belongs in Supabase RLS policies, not service-layer WHERE clauses.
- RLS policy changes require supervisor/database review and are not applied by this branch.
