-- 0068 · An audit trail for who can reach a child's record
--
-- Phase 12's other half. The security sweeps in 0056 prove the policies hold;
-- this records what happened when they did.
--
-- WHAT IS LOGGED, AND WHY NOT MORE
--
-- Not reads. A row per page view would be the largest table in the schema
-- inside a month, it would slow every query a family makes, and nobody has
-- ever reconstructed anything from it. What a clinic actually needs to answer
-- is narrower and much rarer:
--
--   * who gave an adult access to a child's record, and when
--   * who took it away
--   * who changed what that adult may see - the difference between a guardian
--     who can read appointments and one who can read clinical progress is the
--     whole point of the permission model, and a silent change to it is
--     indistinguishable from a policy bug
--   * consent granted and withdrawn
--
-- Every one of those is a deliberate act by a person, they happen a handful of
-- times per family, and each is something someone could later be asked to
-- account for. That is the test for whether a thing belongs in an audit trail.
--
-- WHY IT WRITES TO clinical_audit_events
--
-- 0001 already has that table, with clinic_id, actor_id, client_id, action and
-- a jsonb detail. A second audit table would mean a clinic asking "what
-- happened to this child's record" has two places to look and an ordering
-- problem between them.
--
-- SECURITY DEFINER, BECAUSE THE SUBJECT MUST NOT CONTROL THE RECORD
--
-- The triggers run as definer so an audit row is written even where the actor
-- could not insert one themselves. An audit trail a person can suppress by
-- lacking a permission is not an audit trail.

/**
 * Write one audit row, tolerating an actor who has no profile.
 *
 * `clinical_audit_events.actor_id` references `profiles(id)`. Service-role and
 * migration-time writes have no `auth.uid()` at all, and a foreign key
 * violation inside a trigger would abort the very change being audited - a
 * guardian could not be added because logging the addition failed. The actor
 * is recorded when it is knowable and left null when it is not, which is the
 * honest record either way.
 */
create or replace function public.log_family_access_event(
  p_clinic uuid, p_client bigint, p_action text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid;
begin
  select p.id into v_actor from public.profiles p where p.id = auth.uid();
  insert into public.clinical_audit_events (clinic_id, actor_id, client_id, action, detail)
  values (p_clinic, v_actor, p_client, p_action, p_detail);
end $$;

comment on function public.log_family_access_event(uuid, bigint, text, jsonb) is
  'Writes a family-access event into clinical_audit_events. security definer so '
  'the record is written even when the actor could not insert one themselves - '
  'an audit trail a person can suppress is not one.';

-- ---------------------------------------------------------------------------
-- 1. Guardian relationships
-- ---------------------------------------------------------------------------
create or replace function public.guardian_relationships_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_family_access_event(
      new.clinic_id, new.client_id, 'family.guardian.linked',
      jsonb_build_object(
        'guardian_user_id', new.user_id,
        'relationship', new.relationship,
        'household_id', new.household_id,
        'status', new.status));
    return new;
  end if;

  -- An update is only interesting when it changes reach: the status, or the
  -- window the relationship is live for. Everything else is bookkeeping.
  if new.status is distinct from old.status
     or new.starts_on is distinct from old.starts_on
     or new.ends_on is distinct from old.ends_on then
    perform public.log_family_access_event(
      new.clinic_id, new.client_id,
      case when new.status = 'REVOKED' or (new.ends_on is not null and old.ends_on is null)
           then 'family.guardian.access_ended'
           else 'family.guardian.changed' end,
      jsonb_build_object(
        'guardian_user_id', new.user_id,
        'from', jsonb_build_object('status', old.status, 'starts_on', old.starts_on, 'ends_on', old.ends_on),
        'to',   jsonb_build_object('status', new.status, 'starts_on', new.starts_on, 'ends_on', new.ends_on)));
  end if;
  return new;
end $$;

drop trigger if exists guardian_relationships_audit_trg on guardian_relationships;
create trigger guardian_relationships_audit_trg
  after insert or update on guardian_relationships
  for each row execute function public.guardian_relationships_audit();

-- A deleted relationship is the one case where the row itself stops existing,
-- so the trail is the only remaining evidence it was ever there.
create or replace function public.guardian_relationships_audit_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.log_family_access_event(
    old.clinic_id, old.client_id, 'family.guardian.removed',
    jsonb_build_object('guardian_user_id', old.user_id, 'relationship', old.relationship));
  return old;
end $$;

drop trigger if exists guardian_relationships_audit_del on guardian_relationships;
create trigger guardian_relationships_audit_del
  after delete on guardian_relationships
  for each row execute function public.guardian_relationships_audit_delete();

-- ---------------------------------------------------------------------------
-- 2. Permission changes
--
-- The row that changes is in relationship_permissions, which names a
-- relationship rather than a client - so the client is looked up, or the audit
-- entry would say a permission changed without saying whose record it opens.
-- ---------------------------------------------------------------------------
create or replace function public.relationship_permissions_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  -- Only a change in `granted` matters. An updated_at touch is not a grant.
  if tg_op = 'UPDATE' and new.granted is not distinct from old.granted then
    return new;
  end if;

  select gr.clinic_id, gr.client_id, gr.user_id
    into r
    from public.guardian_relationships gr
   where gr.id = new.relationship_id;

  perform public.log_family_access_event(
    r.clinic_id, r.client_id,
    case when new.granted then 'family.permission.granted' else 'family.permission.revoked' end,
    jsonb_build_object(
      'guardian_user_id', r.user_id,
      'permission', new.permission,
      -- The seeding trigger in 0047 inserts a full default set on every new
      -- relationship. Marking those keeps a clinic's real decisions legible
      -- among sixteen rows written automatically a millisecond earlier.
      'from_default_seed', tg_op = 'INSERT'));
  return new;
end $$;

drop trigger if exists relationship_permissions_audit_trg on relationship_permissions;
create trigger relationship_permissions_audit_trg
  after insert or update on relationship_permissions
  for each row execute function public.relationship_permissions_audit();

-- ---------------------------------------------------------------------------
-- 3. Consent
--
-- consent_records is already append-and-stamp rather than editable, so the row
-- IS the history. It is mirrored here so that "what happened to this child's
-- record" is answerable from one place rather than two.
-- ---------------------------------------------------------------------------
create or replace function public.consent_records_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_family_access_event(
      new.clinic_id, new.client_id, 'family.consent.granted',
      jsonb_build_object('template_id', new.template_id, 'signed_name', new.signed_name));
    return new;
  end if;
  if old.withdrawn_at is null and new.withdrawn_at is not null then
    perform public.log_family_access_event(
      new.clinic_id, new.client_id, 'family.consent.withdrawn',
      jsonb_build_object('template_id', new.template_id, 'reason', new.withdrawal_reason));
  end if;
  return new;
end $$;

drop trigger if exists consent_records_audit_trg on consent_records;
create trigger consent_records_audit_trg
  after insert or update on consent_records
  for each row execute function public.consent_records_audit();

-- ---------------------------------------------------------------------------
-- 4. What a clinic reads
--
-- Resolves the actor and the guardian to names, because an audit trail of
-- UUIDs is a trail nobody reads. Staff-only, and gated on the action that
-- already governs seeing a client's file.
-- ---------------------------------------------------------------------------
create or replace view family_access_audit with (security_invoker = true) as
select
  e.id,
  e.clinic_id,
  e.created_at,
  e.action,
  e.client_id,
  c.name                              as client_name,
  e.actor_id,
  actor.full_name                     as actor_name,
  (e.detail ->> 'guardian_user_id')::uuid as guardian_user_id,
  guardian.full_name                  as guardian_name,
  e.detail ->> 'permission'           as permission,
  coalesce((e.detail ->> 'from_default_seed')::boolean, false) as from_default_seed,
  e.detail
from clinical_audit_events e
left join clients  c        on c.id = e.client_id
left join profiles actor    on actor.id = e.actor_id
left join profiles guardian on guardian.id = (e.detail ->> 'guardian_user_id')::uuid
where e.action like 'family.%';

comment on view family_access_audit is
  'Who gained, lost or changed access to a child''s record, and who granted '
  'consent. Reads are deliberately not logged: a row per page view would be '
  'the largest table in the schema within a month and nobody has ever '
  'reconstructed anything from one.';
