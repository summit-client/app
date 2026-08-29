-- ============================================================================
-- Session type gap-before/gap-after minutes, and a per-type grid-increment
-- override for the scheduler calendar's snap/gridline granularity - a 63
-- minute session type shouldn't be forced onto a 15/30-minute grid the way
-- most session types are. Null means "use the org default"
-- (calendar.gridIncrementMinutes, added alongside this in @summit/settings).
--
-- Also seeds Break / Lunch / Meeting as session types for every existing
-- clinic - non-billable, no client attached (sessions.client_id is
-- nullable; these are clinician-only blocks on the calendar, not client
-- sessions). A clinic created after this migration runs does not get these
-- seeded automatically - the account-provisioning flow would need to do
-- that itself, which is out of scope here; an admin can otherwise add them
-- by hand from the Session Types tab.
-- ============================================================================

alter table session_types add column if not exists gap_before_minutes integer not null default 0;
alter table session_types add column if not exists gap_after_minutes integer not null default 0;
alter table session_types add column if not exists grid_increment_minutes integer;
alter table session_types add column if not exists is_client_optional boolean not null default false;

-- Plain `add constraint` has no IF NOT EXISTS in Postgres, unlike every
-- other guard in this file - wrapped so this migration stays safe to re-run,
-- matching the rest of this repo's migrations.
do $$ begin
  alter table session_types add constraint session_types_gap_before_nonneg check (gap_before_minutes >= 0);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table session_types add constraint session_types_gap_after_nonneg check (gap_after_minutes >= 0);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table session_types add constraint session_types_grid_increment_positive check (grid_increment_minutes is null or grid_increment_minutes > 0);
exception when duplicate_object then null;
end $$;

insert into session_types (name, duration, price, max_clients, color, clinic_id, is_client_optional)
select v.name, v.duration, 0, 1, v.color, c.id, true
from clinics c
cross join (values
  ('Break', 15, '#9AA5B1'),
  ('Lunch', 30, '#9AA5B1'),
  ('Meeting', 30, '#7C8CD8')
) as v(name, duration, color)
where not exists (
  select 1 from session_types st where st.clinic_id = c.id and st.name = v.name
);

-- No RLS policy changes: session_types' existing per-command policies are
-- row-level, not column-level, and already cover the new columns.
