-- 0092: revoking a guardian actually revokes them
--
-- WHAT IS WRONG
--
-- Both family gates carry a legacy branch that predates households:
--
--   auth_accessible_client_ids()   select c.id from clients c where c.user_id = auth.uid()
--   auth_guardian_can(client, _)   exists (select 1 from clients c
--                                           where c.id = p_client and c.user_id = auth.uid())
--
-- Neither checks status, starts_on or ends_on, and the one in auth_guardian_can
-- ignores the permission argument entirely — it returns true for ALL sixteen.
--
-- The guardian branch beside it checks all three. 0047 backfilled a
-- guardian_relationships row for every client carrying a user_id, but no
-- migration has ever cleared clients.user_id. So for anyone who predates 0047,
-- both paths are live and only one of them can be revoked.
--
-- The consequence is the one that matters in a clinical record: setting a
-- relationship to REVOKED or SUSPENDED, or giving it an ends_on in the past,
-- does not take access away. That person keeps the child's sessions, programs,
-- budgets, signed session notes, documents and milestones, keeps my_care_team(),
-- and keeps write and delete on client_availability (0076). A custody change or
-- a safeguarding decision entered through the only mechanism the product offers
-- would appear to work and would not.
--
-- Production today: 1 of 119 clients carries a legacy user_id, and that one
-- also has an ACTIVE relationship — so nothing is being exploited right now.
-- The mechanism is what is broken, and it is the mechanism revocation runs on.
--
-- WHAT THIS CHANGES
--
-- The legacy branch now applies only when there is NO relationship row for that
-- (user, client) pair. Once a relationship exists, it governs — including when
-- it says REVOKED, SUSPENDED or expired.
--
-- Deliberately not "drop the legacy branch". An account the 0047 backfill
-- missed would lose access to its own record, and this migration cannot prove
-- there is none. Deferring to the relationship when one exists fixes revocation
-- without taking anything from anyone the backfill did not reach.
--
-- The permission argument is still ignored on the legacy branch, which is
-- correct there: that branch is a CLIENT reading their own record, not a
-- guardian holding delegated permissions.
--
-- HOW TO VERIFY
--
--   Pick a client with a non-null user_id and an ACTIVE relationship for the
--   same user (client 56 in production today). As that user:
--     select count(*) from sessions where client_id = 56;   -- rows
--   Then, in a transaction you roll back:
--     update guardian_relationships set status = 'REVOKED'
--      where client_id = 56 and user_id = '<that user>';
--     select count(*) from sessions where client_id = 56;   -- must now be 0
--   Before this migration the second count is unchanged. Roll back.
--
--   An account with a user_id and NO relationship row must be unaffected
--   throughout.
--
--   node supabase/tests/apply.mjs supabase/migrations
--   node supabase/tests/rls.mjs supabase/migrations
--   node supabase/tests/tenancy.mjs supabase/migrations

create or replace function public.auth_accessible_client_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- The legacy link, deferring to a relationship whenever one exists for this
  -- pair. Without that `not exists`, revoking the relationship below leaves
  -- this branch still returning the row.
  select c.id
    from public.clients c
   where c.user_id = auth.uid()
     and not exists (
       select 1 from public.guardian_relationships gr
        where gr.client_id = c.id and gr.user_id = auth.uid())
  union
  select gr.client_id
    from public.guardian_relationships gr
   where gr.user_id = auth.uid()
     and gr.status = 'ACTIVE'
     and (gr.starts_on is null or gr.starts_on <= current_date)
     and (gr.ends_on is null or gr.ends_on >= current_date)
$$;

create or replace function public.auth_guardian_can(p_client bigint, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- A client reading their own record. Not a guardian, so the permission
    -- argument does not apply — but it now yields to a relationship when one
    -- exists, so revocation reaches it.
    exists (select 1 from public.clients c
             where c.id = p_client
               and c.user_id = auth.uid()
               and not exists (
                 select 1 from public.guardian_relationships gr
                  where gr.client_id = c.id and gr.user_id = auth.uid()))
    or exists (
      select 1
        from public.guardian_relationships gr
        join public.relationship_permissions rp on rp.relationship_id = gr.id
       where gr.user_id = auth.uid()
         and gr.client_id = p_client
         and gr.status = 'ACTIVE'
         and (gr.starts_on is null or gr.starts_on <= current_date)
         and (gr.ends_on is null or gr.ends_on >= current_date)
         and rp.permission = p_permission
         and rp.granted
    )
$$;

comment on function public.auth_guardian_can(bigint, text) is
  'May the caller see this of this child. The legacy clients.user_id branch '
  'yields to a guardian_relationships row whenever one exists (0092), so '
  'REVOKED, SUSPENDED and expired actually revoke - before that they did not, '
  'for anyone who predates 0047.';
