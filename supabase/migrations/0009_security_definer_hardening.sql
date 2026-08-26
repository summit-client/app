-- 0009 · Two live defects in 0001 and 0003
--
-- Both are already applied to production, so they are corrected here rather than
-- by editing the original files.
--
-- ============================================================================
-- 1. search_path = public does NOT exclude pg_temp
-- ============================================================================
--
-- Postgres searches the session's temporary schema for RELATIONS before the
-- schemas listed in search_path, unless pg_temp is named explicitly. The three
-- helpers in 0001 are `security definer` with `set search_path = public`, and
-- every RLS policy in the schema depends on them.
--
-- So any authenticated user can do this:
--
--   create temp table profiles (id uuid, clinic_id uuid, role text);
--   insert into profiles values (auth.uid(), '<any clinic uuid>', 'admin');
--
-- and from that point in the session auth_clinic_id() and auth_role() - running
-- as the definer, so with the definer's rights - read the attacker's table.
-- Verified against PostgreSQL 16:
--
--   real clinic + role: 11111111-...-111111111111 / clinician
--   after shadowing:    99999999-...-999999999999 / admin
--
-- That is every clinical table in 0001-0005, for any clinic the attacker names.
-- The precondition is TEMP on the database, which PUBLIC holds by default
-- (confirmed: has_database_privilege('public', current_database(), 'TEMP') = true
-- on a stock instance - worth confirming on the live project, see below).
--
-- Two changes, belt and braces: pg_temp is named LAST so it is searched last,
-- and every reference inside the function bodies is schema-qualified so the
-- search_path is not load-bearing at all.

create or replace function auth_clinic_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as
$$ select clinic_id from public.profiles where id = auth.uid() $$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public, pg_temp as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function auth_is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select public.auth_role() in ('admin','supervisor','clinician') $$;

-- Defence in depth: the attack needs TEMP on the database. Nothing in Summit
-- creates temporary tables, so revoking it from the API roles costs nothing.
-- Wrapped because role names differ between a Supabase project and a plain
-- Postgres, and this must not abort the migration.
do $$
begin
  begin
    execute 'revoke temporary on database ' || quote_ident(current_database()) || ' from public';
  exception when others then
    raise notice 'could not revoke TEMP from public (%), the search_path fix above still holds', sqlerrm;
  end;
end $$;

-- ============================================================================
-- 2. Signed clinical reports are not actually immutable
-- ============================================================================
--
-- 0003's guard reads:
--
--   if old.status in ('signed','locked') and new.status not in ('superseded')
--
-- so adding `status = 'superseded'` to the same UPDATE exempts the whole
-- statement. Verified against PostgreSQL 16 - the first is refused, the second
-- rewrites the report's content, its signer and its signature timestamp:
--
--   BLOCKED  rewrite a SIGNED report the obvious way
--   ALLOWED  rewrite it while ALSO setting status=superseded
--   -> superseded  blocks={"summary": "FORGED"}  signed_by=<a different user>
--
-- Superseding is a legitimate operation, so it stays permitted - but it may
-- only change the status. Everything a signature attests to is now compared
-- column by column.

create or replace function forbid_signed_report_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status not in ('signed','locked') then
    return new;                                  -- drafts stay editable
  end if;

  -- The only permitted transition on a signed version is signed -> superseded,
  -- and nothing else about the row may move with it.
  if new.status = 'superseded'
     and new.blocks       is not distinct from old.blocks
     and new.signed_by    is not distinct from old.signed_by
     and new.signed_at    is not distinct from old.signed_at
     and new.client_id    is not distinct from old.client_id
     and new.clinic_id    is not distinct from old.clinic_id
     and new.report_group is not distinct from old.report_group
     and new.version      is not distinct from old.version
     and new.report_type  is not distinct from old.report_type
     and new.period_start is not distinct from old.period_start
     and new.period_end   is not distinct from old.period_end
     and new.packet_id    is not distinct from old.packet_id
     and new.created_by   is not distinct from old.created_by then
    return new;
  end if;

  raise exception
    'Signed report versions are immutable. Supersede this version (status only) and insert version+1.';
end $$;

-- The trigger itself is unchanged; replacing the function is enough.
