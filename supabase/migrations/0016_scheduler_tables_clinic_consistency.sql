-- ============================================================================
-- Cross-table clinic_id consistency for the eight legacy scheduler tables.
--
-- Migration 0013 gave clients/staff/sessions/calendars/locations/
-- session_types/client_availability/staff_availability real clinic_id
-- columns and RLS, but explicitly flagged one residual gap: nothing stops a
-- row's own clinic_id from disagreeing with the clinic_id of whatever it
-- references. A sessions row could be written with clinic_id = A while its
-- client_id points at a client whose clinic_id is B, or its employee_id at
-- staff in clinic C - RLS makes this hard to exploit (an admin can't read
-- another clinic's client id to reference it in the first place, since
-- clients_staff_select is clinic-scoped) but not impossible, and 0013 called
-- it "worth doing before a second clinic goes live for real." That's now
-- happening, so this closes it before it's load-bearing.
--
-- Approach: a BEFORE INSERT OR UPDATE trigger per table, checking each
-- foreign reference's own clinic_id against NEW.clinic_id and refusing the
-- write on any mismatch. Plain plpgsql, not security definer - matches this
-- schema's other row-level business-logic triggers (forbid_over_allocation,
-- forbid_closed_cycle_edit, forbid_ack_identity_change in 0007), so the
-- lookup runs under the caller's own RLS. That's actually the right
-- behaviour here, not an oversight: if the caller can't even see the
-- referenced row (wrong clinic), the lookup returns null, null is distinct
-- from any real clinic_id, and the write is refused exactly as it should be
-- - "can't verify" and "verified mismatch" both correctly fail closed.
--
-- Only the three tables with a cross-reference to another clinic-scoped
-- table need this: sessions (client_id, employee_id, calendar_id) and
-- client_availability/staff_availability (client_id/staff_id).
-- calendars/locations/session_types/clients/staff don't reference each
-- other, so there is nothing for them to disagree with.
-- ============================================================================

create or replace function enforce_sessions_clinic_consistency() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_client_clinic uuid;
declare v_staff_clinic uuid;
declare v_calendar_clinic uuid;
begin
  select clinic_id into v_client_clinic from clients where id = new.client_id;
  if v_client_clinic is distinct from new.clinic_id then
    raise exception 'session clinic_id (%) does not match its client''s clinic (%)', new.clinic_id, v_client_clinic;
  end if;

  if new.employee_id is not null then
    select clinic_id into v_staff_clinic from staff where id = new.employee_id;
    if v_staff_clinic is distinct from new.clinic_id then
      raise exception 'session clinic_id (%) does not match its staff member''s clinic (%)', new.clinic_id, v_staff_clinic;
    end if;
  end if;

  if new.calendar_id is not null then
    select clinic_id into v_calendar_clinic from calendars where id = new.calendar_id;
    if v_calendar_clinic is distinct from new.clinic_id then
      raise exception 'session clinic_id (%) does not match its calendar''s clinic (%)', new.clinic_id, v_calendar_clinic;
    end if;
  end if;

  return new;
end $$;
drop trigger if exists sessions_clinic_consistency on sessions;
create trigger sessions_clinic_consistency before insert or update on sessions
  for each row execute function enforce_sessions_clinic_consistency();

create or replace function enforce_client_availability_clinic_consistency() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_client_clinic uuid;
begin
  select clinic_id into v_client_clinic from clients where id = new.client_id;
  if v_client_clinic is distinct from new.clinic_id then
    raise exception 'client_availability clinic_id (%) does not match its client''s clinic (%)', new.clinic_id, v_client_clinic;
  end if;
  return new;
end $$;
drop trigger if exists client_availability_clinic_consistency on client_availability;
create trigger client_availability_clinic_consistency before insert or update on client_availability
  for each row execute function enforce_client_availability_clinic_consistency();

create or replace function enforce_staff_availability_clinic_consistency() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_staff_clinic uuid;
begin
  select clinic_id into v_staff_clinic from staff where id = new.staff_id;
  if v_staff_clinic is distinct from new.clinic_id then
    raise exception 'staff_availability clinic_id (%) does not match its staff member''s clinic (%)', new.clinic_id, v_staff_clinic;
  end if;
  return new;
end $$;
drop trigger if exists staff_availability_clinic_consistency on staff_availability;
create trigger staff_availability_clinic_consistency before insert or update on staff_availability
  for each row execute function enforce_staff_availability_clinic_consistency();
