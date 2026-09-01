-- ============================================================================
-- 0036 · Client document center — metadata for apps/client's new "Documents"
-- screen (the family portal). Backs the family being able to view/download
-- documents shared with them (intake forms, care plan documents) and upload
-- signed paperwork back to the clinic.
--
-- This table is METADATA ONLY. The file bytes live in Supabase Storage, a
-- completely separate permission system from table RLS — see the "MANUAL
-- STEPS REQUIRED" block at the bottom of this file before treating this
-- migration as making the feature work end to end.
--
-- `direction` distinguishes the two flows the screen supports, in one table
-- because they're the same shape (a file, a title, who put it there, when)
-- and the family's list shows both together, newest first:
--   staff_to_client   the clinic shares something with the family (an
--                     intake form to fill out, a signed care plan copy) —
--                     staff upload, the family reads/downloads.
--   client_to_staff   the family sends something back (the completed,
--                     signed form) — the family uploads, staff read.
--
-- Deliberately no UPDATE or DELETE policy on this table at all, for anyone —
-- consistent with CLAUDE.md's "per command, never for all" rule (deletes are
-- denied by default across this schema) and with signed paperwork: a
-- corrected document is a new upload, not an edit of history.
-- ============================================================================

create table if not exists client_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null references clients(id) on delete cascade,

  -- Path within the Storage bucket (see manual steps below), not a public
  -- URL — the app resolves a short-lived signed URL from this at render
  -- time rather than storing one, since a signed URL expires and a path
  -- does not. Written by the app as `{clinic_id}/{client_id}/{uuid}-
  -- {filename}`; the storage.objects policies suggested below assume that
  -- exact shape (they split_part() the object name on '/').
  file_path text not null,
  title text not null,
  direction text not null check (direction in ('staff_to_client', 'client_to_staff')),

  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists client_documents_client_idx
  on client_documents(client_id, created_at desc);
create index if not exists client_documents_clinic_idx
  on client_documents(clinic_id, created_at desc);

-- RLS: same clinic-wide-staff / own-record-only-family split every other
-- family-facing table uses (0020's programs/session_notes, 0023's
-- client_budgets/budget_entries). auth_is_staff() (0001, hardened 0009)
-- covers admin/supervisor/clinician — the same clinical-staff boundary
-- programs and session_notes use, not the wider "any staff role" set,
-- since intake/care-plan documents are clinical documentation. Both write
-- policies pin `direction` and `uploaded_by` themselves rather than trusting
-- the app to set them correctly, so a staff account can't insert a row that
-- impersonates a family upload (or vice versa) even if a future UI bug got
-- the direction wrong.
alter table client_documents enable row level security;

create policy client_documents_staff_read on client_documents for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy client_documents_staff_write on client_documents for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_is_staff()
    and direction = 'staff_to_client'
    and uploaded_by = auth.uid()
  );

create policy client_documents_client_read on client_documents for select
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id());

create policy client_documents_client_write on client_documents for insert
  with check (
    public.auth_role() = 'client'
    and client_id = public.auth_client_row_id()
    and direction = 'client_to_staff'
    and uploaded_by = auth.uid()
  );

-- ============================================================================
-- MANUAL STEPS REQUIRED BEFORE THIS FEATURE WORKS — none of this is run by
-- this migration. The Supabase MCP available to Claude sessions in this repo
-- is read-only (see root CLAUDE.md's "Supabase access for Claude sessions"),
-- so a human with dashboard/CLI access must:
--
--   1. Run this migration against the live database.
--
--   2. Create a Storage bucket named `client-documents`, set PRIVATE (not
--      public). This table's RLS above governs the METADATA ROW only — the
--      bucket and its own storage.objects policies are a SEPARATE
--      permission system that this migration cannot create (bucket
--      creation and, conventionally, its policies are dashboard/CLI
--      actions, not a plain migration). Skipping this step, or leaving the
--      bucket public, means either every upload silently fails (private
--      bucket, no policies) or every file in it is downloadable by anyone
--      with the URL regardless of clinic or client (public bucket) — the
--      table RLS above would not catch either failure mode, because it
--      never sees Storage requests at all.
--
--   3. Add storage.objects RLS policies scoped to the same clinic_id/
--      client_id boundary as the table policies above, matching the
--      `{clinic_id}/{client_id}/{filename}` path convention the app writes.
--      Suggested SQL (run manually, after the bucket exists — reuses
--      auth_is_staff()/auth_role()/auth_client_row_id(), already defined by
--      migrations 0001/0009/0020):
--
--        create policy client_documents_bucket_staff_read on storage.objects
--          for select using (
--            bucket_id = 'client-documents'
--            and auth_is_staff()
--            and split_part(name, '/', 1)::uuid = auth_clinic_id()
--          );
--
--        create policy client_documents_bucket_staff_write on storage.objects
--          for insert with check (
--            bucket_id = 'client-documents'
--            and auth_is_staff()
--            and split_part(name, '/', 1)::uuid = auth_clinic_id()
--          );
--
--        create policy client_documents_bucket_client_read on storage.objects
--          for select using (
--            bucket_id = 'client-documents'
--            and auth_role() = 'client'
--            and split_part(name, '/', 2)::bigint = auth_client_row_id()
--          );
--
--        create policy client_documents_bucket_client_write on storage.objects
--          for insert with check (
--            bucket_id = 'client-documents'
--            and auth_role() = 'client'
--            and split_part(name, '/', 2)::bigint = auth_client_row_id()
--          );
--
--      No delete/update policy suggested here either, for the same reason
--      the table above has none — a superseding upload, not an edit.
-- ============================================================================
