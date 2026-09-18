-- ---------------------------------------------------------------------------
-- 0081 — gate three SECURITY DEFINER functions that any authenticated caller
--        could run against any clinic.
--
-- NOT APPLIED. Written for a human to run; nothing here has been executed.
--
-- A SECURITY DEFINER function runs with its owner's privileges, so RLS on the
-- tables it touches does not apply to the caller. That is the point of the
-- mechanism and it is fine — as long as the function decides for itself who
-- may call it. These three decide nothing:
--
--   * public.record_session_delivery(bigint)                     — 0031:113
--   * public.derive_pending_session_deliveries(uuid, date, date) — 0031:286
--   * public.log_family_access_event(uuid, bigint, text, jsonb)  — 0068:48
--
-- None carries a role check, a clinic check or a revoke, and every function in
-- `public` is EXECUTE-able by `public` by default. All three are reachable over
-- PostgREST's /rpc/ endpoint by anyone holding any session — a guardian's
-- family account included. Concretely, before this migration:
--
--   * `derive_pending_session_deliveries` takes the clinic as an argument, so a
--     caller names the tenant. It writes time_entries, budget_entries and
--     organization_events into that clinic and returns a row per completed
--     session. Payroll and billing writes, cross-tenant, from any account.
--   * `record_session_delivery` takes a session id — an enumerable bigint —
--     with no clinic or role predicate, and returns that session's minutes,
--     charged amount and skipped_reason.
--   * `log_family_access_event` inserts clinic_id, client_id, action and detail
--     straight from its arguments into clinical_audit_events. Only actor_id is
--     derived from auth.uid(). Anyone can forge audit rows in any clinic, which
--     is worse than no audit trail: a forged record is believed.
--
-- The idiom is 0077's, which already does this for sessions_visible():
-- `revoke all ... from public`, then grant deliberately.
--
-- Verify afterwards (as a non-admin, non-service caller):
--   select proname, proacl from pg_proc
--    where proname in ('record_session_delivery',
--                      'derive_pending_session_deliveries',
--                      'log_family_access_event');
--   -- expect an explicit ACL, not NULL (NULL means "public may execute")
--   select public.record_session_delivery(1);              -- expect 42501
--   select * from public.derive_pending_session_deliveries(
--     '00000000-0000-0000-0000-000000000000'::uuid);       -- expect 42501
--   select public.log_family_access_event(
--     '00000000-0000-0000-0000-000000000000'::uuid, 1, 'x', '{}'::jsonb);
--                                                          -- expect 42501
-- and, as a clinic admin, that the Workforce screen's "derive" action still
-- returns its queue for that admin's own clinic.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. record_session_delivery — no caller outside the database.
--
-- Its only caller is derive_pending_session_deliveries below, which is itself
-- SECURITY DEFINER and therefore executes as the owner, who holds EXECUTE
-- implicitly. A grep of apps/ and packages/ finds no RPC call to it, so
-- removing the public grant costs nothing on the application side.
-- ---------------------------------------------------------------------------
revoke all on function public.record_session_delivery(bigint) from public;
revoke all on function public.record_session_delivery(bigint) from anon;
revoke all on function public.record_session_delivery(bigint) from authenticated;
grant execute on function public.record_session_delivery(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 2. derive_pending_session_deliveries — one real caller, so it keeps the
--    grant and gains a gate instead.
--
-- apps/data/lib/workforce.ts:272 calls this over RPC as the signed-in user
-- from the Workforce settings screen, so a blanket revoke would take that
-- action away. The body below is 0031's, unchanged, with an authorization
-- check prepended: the caller must be an admin, and p_clinic must be their
-- own clinic. Naming the clinic in the argument list is exactly what made
-- this cross-tenant, so the argument is now checked against the session
-- rather than trusted.
--
-- Note for the application side, deliberately NOT changed here:
-- apps/data/components/settings/workforce.tsx renders this action for any
-- clinician, where its sibling settings sections check for admin. After this
-- migration a clinician pressing it gets a clear refusal instead of a
-- cross-tenant write, which is the right failure — but the button should
-- still be gated in the app.
-- ---------------------------------------------------------------------------
create or replace function public.derive_pending_session_deliveries(
  p_clinic uuid, p_from date default null, p_to date default null
) returns table (session_id bigint, time_entry_id uuid, budget_entry_id uuid, skipped_reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
  r session_delivery_result;
begin
  -- Added by 0081. Everything below this block is 0031's body verbatim.
  if public.auth_role() is distinct from 'admin'
     or public.auth_clinic_id() is null
     or p_clinic is distinct from public.auth_clinic_id() then
    raise exception 'not authorised to derive session deliveries for that clinic'
      using errcode = '42501';
  end if;

  for s in
    select ses.id from public.sessions ses
     where ses.clinic_id = p_clinic
       and ses.status = 'completed'
       and (p_from is null or ses.session_date >= p_from)
       and (p_to is null or ses.session_date <= p_to)
       and not exists (select 1 from public.time_entries t where t.session_id = ses.id)
     order by ses.session_date
  loop
    r := public.record_session_delivery(s.id);
    session_id := s.id;
    time_entry_id := r.time_entry_id;
    budget_entry_id := r.budget_entry_id;
    skipped_reason := r.skipped_reason;
    return next;
  end loop;
end $$;

revoke all on function public.derive_pending_session_deliveries(uuid, date, date) from public;
revoke all on function public.derive_pending_session_deliveries(uuid, date, date) from anon;
grant execute on function public.derive_pending_session_deliveries(uuid, date, date) to authenticated;
grant execute on function public.derive_pending_session_deliveries(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- 3. log_family_access_event — called only by triggers.
--
-- 0068's four audit triggers (guardian_relationships_audit,
-- guardian_relationships_audit_delete, relationship_permissions_audit,
-- consent_records_audit) are each SECURITY DEFINER themselves, so their
-- `perform public.log_family_access_event(...)` runs as the owner and does
-- not need the caller to hold EXECUTE. Nothing in apps/ or packages/ calls it
-- over RPC. Removing the public grant therefore leaves the audit trail intact
-- while closing the forgery path.
-- ---------------------------------------------------------------------------
revoke all on function public.log_family_access_event(uuid, bigint, text, jsonb) from public;
revoke all on function public.log_family_access_event(uuid, bigint, text, jsonb) from anon;
revoke all on function public.log_family_access_event(uuid, bigint, text, jsonb) from authenticated;
grant execute on function public.log_family_access_event(uuid, bigint, text, jsonb) to service_role;

-- PostgREST caches the schema; a changed function signature or ACL is not
-- reflected on the API until it reloads. Same reason 0077 ends this way.
notify pgrst, 'reload schema';
