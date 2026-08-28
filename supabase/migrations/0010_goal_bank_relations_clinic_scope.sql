-- ============================================================================
-- goal_bank_relations had no clinic scoping at all, unlike goal_bank_entries
-- right beside it: any staff member of any clinic could read or insert a
-- relation referencing another clinic's private (non-shared) goal_bank_entries
-- row - leaking that entry's existence, UUID and free-text note, and letting
-- one clinic link into another clinic's private knowledge graph without ever
-- being able to see the entry directly. Confirmed against a local replay
-- (supabase/tests/goal_bank_relations_rls.sql): a second clinic's account
-- could insert and then read back a relation touching an entry it has no
-- other access to, while direct access to that entry was correctly refused.
--
-- Fix: a relation is visible/insertable only when both endpoints are entries
-- the caller can already see under goal_bank_entries' own read policy (shared,
-- or the caller's own clinic). Referencing goal_bank_entries from inside this
-- policy re-applies that policy to the caller - not a bypass - so the clinic
-- condition doesn't need to be duplicated here.
-- ============================================================================

drop policy if exists goal_bank_rel_read on goal_bank_relations;
create policy goal_bank_rel_read on goal_bank_relations for select
  using (
    auth_is_staff()
    and exists (select 1 from goal_bank_entries e where e.id = from_entry)
    and exists (select 1 from goal_bank_entries e where e.id = to_entry)
  );

drop policy if exists goal_bank_rel_write on goal_bank_relations;
create policy goal_bank_rel_write on goal_bank_relations for insert
  with check (
    auth_is_staff()
    and exists (select 1 from goal_bank_entries e where e.id = from_entry)
    and exists (select 1 from goal_bank_entries e where e.id = to_entry)
  );
