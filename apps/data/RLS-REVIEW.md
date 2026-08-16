# RLS Review (Supervisor Action Required)

## Scope
This branch audit identified broad authenticated policies on these tables:

- behaviour_events
- on_off_task_intervals
- task_tracking_items
- clinician_goals

The same broad pattern was also found on:

- goal_progress_entries

## Current State
- RLS is enabled on all five tables.
- Current policies allow authenticated access with unscoped predicates:
  - using (true)
  - with check (true)
- Current policies do not use auth.uid() to scope records to the authenticated clinician/client relationship.

## Security Impact
Any authenticated user can read/write rows that are not necessarily theirs, which allows cross-tenant data access and modification.

## Proposed SQL For Supervisor Review (Not Applied By This Branch)
The SQL below is a review draft only. It is intentionally not executed in this branch.

Important prerequisite:
- A trusted clinician-to-client assignment relation must be available and approved (for example, public.clinician_client_assignments with clinician_id and client_id).
- This branch does not create or modify assignment schema.

```sql
-- REVIEW DRAFT ONLY: DO NOT APPLY WITHOUT SUPERVISOR APPROVAL
-- Assumes a vetted assignment table:
--   public.clinician_client_assignments(clinician_id uuid/text, client_id text)

-- behaviour_events
DROP POLICY IF EXISTS behaviour_events_authenticated_all ON public.behaviour_events;
CREATE POLICY behaviour_events_clinician_scope
  ON public.behaviour_events
  FOR ALL
  TO authenticated
  USING (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = behaviour_events.client_id
    )
  )
  WITH CHECK (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = behaviour_events.client_id
    )
  );

-- on_off_task_intervals
DROP POLICY IF EXISTS on_off_task_intervals_authenticated_all ON public.on_off_task_intervals;
CREATE POLICY on_off_task_intervals_clinician_scope
  ON public.on_off_task_intervals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = on_off_task_intervals.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = on_off_task_intervals.client_id
    )
  );

-- task_tracking_items
DROP POLICY IF EXISTS task_tracking_items_authenticated_all ON public.task_tracking_items;
CREATE POLICY task_tracking_items_clinician_scope
  ON public.task_tracking_items
  FOR ALL
  TO authenticated
  USING (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = task_tracking_items.client_id
    )
  )
  WITH CHECK (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = task_tracking_items.client_id
    )
  );

-- clinician_goals
DROP POLICY IF EXISTS clinician_goals_authenticated_all ON public.clinician_goals;
CREATE POLICY clinician_goals_clinician_scope
  ON public.clinician_goals
  FOR ALL
  TO authenticated
  USING (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = clinician_goals.client_id
    )
  )
  WITH CHECK (
    clinician_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.clinician_client_assignments cca
      WHERE cca.clinician_id = auth.uid()::text
        AND cca.client_id = clinician_goals.client_id
    )
  );

-- goal_progress_entries
DROP POLICY IF EXISTS goal_progress_entries_authenticated_all ON public.goal_progress_entries;
CREATE POLICY goal_progress_entries_clinician_scope
  ON public.goal_progress_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clinician_goals g
      WHERE g.id = goal_progress_entries.goal_id
        AND (
          g.clinician_id = auth.uid()::text
          OR EXISTS (
            SELECT 1
            FROM public.clinician_client_assignments cca
            WHERE cca.clinician_id = auth.uid()::text
              AND cca.client_id = g.client_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clinician_goals g
      WHERE g.id = goal_progress_entries.goal_id
        AND (
          g.clinician_id = auth.uid()::text
          OR EXISTS (
            SELECT 1
            FROM public.clinician_client_assignments cca
            WHERE cca.clinician_id = auth.uid()::text
              AND cca.client_id = g.client_id
          )
        )
    )
  );
```

## Branch Safety Statement
- This branch does not apply any RLS migration.
- This branch does not modify existing Supabase policies.
- Supervisor/database review is required before any migration is executed.

## Verification Status
End-to-end decoy verification remains pending because the test environment was not reachable during this branch audit.
