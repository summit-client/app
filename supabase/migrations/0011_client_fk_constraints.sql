-- ============================================================================
-- No FK from client_id to clients on twelve clinical tables (compliance.md
-- said eleven; a fresh count against these migrations finds a twelfth,
-- ai_requests). Deleting a client currently silently orphans every program,
-- note, trial event, evidence packet and report for that child - the row
-- just points at a client_id that no longer exists, with nothing to catch it.
--
-- Added NOT VALID: this applies immediately and is fully enforced for every
-- new insert/update from this point on, and for any future delete of a
-- clients row (RESTRICT is the default with no ON DELETE clause - a client
-- cannot be deleted while clinical records reference them, which is the
-- right default given PHIPA's 10-year retention requirement; CASCADE would
-- destroy those records and SET NULL would sever their clinical meaning).
-- NOT VALID skips checking rows that already exist, so this cannot fail or
-- block on any orphans admin.tsx's unchecked client deletes may have already
-- created. Before running VALIDATE CONSTRAINT to fully close that gap, check
-- for existing orphans first, one query per table, e.g.:
--
--   select id, client_id from programs p
--   where not exists (select 1 from clients c where c.id = p.client_id);
--
-- Any rows returned need a decision (attach to the right client, or archive)
-- before validating - that decision is not this migration's to make.
-- ============================================================================

alter table programs
  add constraint programs_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table session_records
  add constraint session_records_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table behaviour_incidents
  add constraint behaviour_incidents_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table session_notes
  add constraint session_notes_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table clinical_audit_events
  add constraint clinical_audit_events_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table clinical_decisions
  add constraint clinical_decisions_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table caregiver_goals
  add constraint caregiver_goals_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table assessments
  add constraint assessments_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table evidence_packets
  add constraint evidence_packets_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table clinical_reports
  add constraint clinical_reports_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table ai_requests
  add constraint ai_requests_client_id_fkey foreign key (client_id) references clients(id) not valid;
alter table client_sessions
  add constraint client_sessions_client_id_fkey foreign key (client_id) references clients(id) not valid;

-- session_notes, clinical_audit_events and ai_requests never got a client_id
-- index (every other table on this list already has one from its own
-- migration). Without one, validating the constraint later - or any delete
-- from clients - forces a sequential scan of the whole table to check for
-- references.
create index if not exists session_notes_client_idx on session_notes(client_id);
create index if not exists clinical_audit_events_client_idx on clinical_audit_events(client_id);
create index if not exists ai_requests_client_idx on ai_requests(client_id);
