-- 0055 · An outstanding form is a task
--
-- 0042 built `family_tasks` as a view over live entities, precisely so a new
-- kind of outstanding thing could be added by teaching the view about it
-- rather than by writing rows into an inbox and remembering to unwrite them.
-- This is the first time that pays off: forms arrived in 0054 and become a
-- task here with no backfill, no reconciliation, and nothing to clear when a
-- family completes one. A cancelled or completed assignment is simply absent
-- from the source query.
--
-- APPENDED, NOT RETYPED
--
-- The obvious way to add a branch to a four-branch view is to paste the whole
-- definition and add a fifth. The first draft of this migration did exactly
-- that and silently broke the funding task: 0042 filters on
-- `p.status = 'ACTIVE'` and the retyped copy said `'active'`. Postgres
-- accepted it, every test that read a funding task went quiet, and the only
-- reason it surfaced is that two tests asserted a task existed rather than
-- asserting a count.
--
-- So the existing definition is read back from the catalogue and the new
-- branch appended to it. Nothing that already works passes through a keyboard.
-- The same reasoning as 0052's diagnostic views, and for the same reason: a
-- forty-line view transcribed by hand is where a predicate quietly changes
-- meaning.
do $$
declare existing text;
begin
  select rtrim(btrim(pg_get_viewdef('public.family_tasks'::regclass, true)), ';')
    into existing;

  execute format($fmt$
    create or replace view public.family_tasks with (security_invoker = true) as
    %s

    union all

    -- 5. A form the clinic is waiting on.
    --
    --    `view_forms` rather than `complete_forms` is the required permission,
    --    deliberately: a guardian who can see the form but not answer it should
    --    still know it is outstanding, because what they can usefully do is tell
    --    the parent who can. Gating the task on the ability to act would hide
    --    the request from half the household.
    --
    --    Optional forms are excluded. A task a family is never chased about
    --    teaches them the list is not worth reading.
    select
      'form:' || a.id::text,
      a.client_id,
      'form',
      case when t.kind = 'consent' then 'Consent needed' else 'Form to complete' end,
      t.title || case
        when a.due_on is null then ''
        when a.due_on < current_date then ' - overdue'
        else ' - due ' || to_char(a.due_on, 'FMDD FMMonth')
      end,
      a.due_on,
      case when a.due_on is not null and a.due_on <= current_date + 3
           then 'high' else 'normal' end,
      'view_forms',
      '/forms?form=' || a.id::text
    from public.form_assignments a
    join public.form_templates t on t.id = a.template_id
    where a.completed_at is null
      and a.cancelled_at is null
      and a.is_required
      and t.status = 'published'
      and a.client_id in (select public.auth_accessible_client_ids())
  $fmt$, existing);
end $$;

comment on view family_tasks is
  'What still needs a family''s attention, computed from the entities it is '
  'about rather than stored. A task disappears when the underlying thing stops '
  'being true, so nothing can go stale and nothing needs marking complete. '
  'required_permission is the guardian permission a caller must hold; filter on '
  'auth_guardian_can(client_id, required_permission).';

-- `create or replace view` drops reloptions when the WITH clause is omitted.
-- It is supplied above, but the sweep is cheap and this is exactly the
-- migration where forgetting would matter: family_tasks carries per-child
-- clinical and financial detail.
do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker'), 'false') <> 'true'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
end $$;
