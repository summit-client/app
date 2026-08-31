-- 0022 · Client budgets and the statement ledger
--
-- Funding-source agnostic by design. A budget is an amount of money made
-- available to a client for a period, whatever its origin: a government
-- program, private pay, insurance, a grant, a school board or a family
-- contribution. Nothing here assumes one funder, and a client may hold
-- several budgets at once (for example a program allocation alongside
-- private pay for hours beyond it).
--
-- Two levels, the same shape the rest of Summit uses:
--   budget            the allocation, entered once
--   budget_entries    every charge and credit against it, immutable in effect
--
-- "Spent to date" is always derived by summing entries. It is never stored as
-- a running total on the budget, because a stored total drifts the moment an
-- entry is corrected, and reconciliation then has two numbers to argue with.

create table if not exists client_budgets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  client_id bigint not null,

  name text not null,                  -- what the family calls it
  funding_source text not null,        -- free text: the org names its own sources
  reference text,                      -- funder's own file or case number

  allocated_amount numeric(12,2) not null check (allocated_amount >= 0),
  currency text not null default 'CAD',

  period_start date not null,
  period_end date,                     -- null: open-ended until closed

  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'EXHAUSTED', 'CLOSED')),
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists client_budgets_client_idx on client_budgets(client_id, period_start desc);

-- Every movement against a budget. A charge is positive spend; a credit or
-- adjustment is negative. Entries carry their own description and, where the
-- charge came from delivered service, a link back to the session that
-- produced it, so a statement line can always be traced to the work.
create table if not exists budget_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  budget_id uuid not null references client_budgets(id) on delete cascade,

  entry_date date not null,
  kind text not null check (kind in ('CHARGE', 'CREDIT', 'ADJUSTMENT')),
  description text not null,

  -- Optional service detail. Present when the entry came from delivered work.
  session_id bigint references client_sessions(id) on delete set null,
  service_type text,
  quantity numeric(10,2),              -- hours or units
  unit_rate numeric(10,2),

  amount numeric(12,2) not null,       -- positive spends the budget, negative returns to it

  -- Reconciliation state. Entries are not deleted once reconciled; a
  -- correcting entry is added instead, so the audit trail stays intact.
  reconciled boolean not null default false,
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists budget_entries_budget_idx on budget_entries(budget_id, entry_date);
create index if not exists budget_entries_session_idx on budget_entries(session_id);

-- A reconciled entry is settled: its money may not be edited afterwards.
-- Corrections are made by adding an ADJUSTMENT, which keeps the statement
-- auditable rather than rewriting history.
create or replace function forbid_reconciled_entry_change() returns trigger
language plpgsql as $$
begin
  if old.reconciled and (
    new.amount is distinct from old.amount
    or new.entry_date is distinct from old.entry_date
    or new.kind is distinct from old.kind
    or new.budget_id is distinct from old.budget_id
  ) then
    raise exception 'Entry % is reconciled; add an adjustment instead of editing it.', old.id;
  end if;
  return new;
end $$;
drop trigger if exists budget_entries_forbid_reconciled on budget_entries;
create trigger budget_entries_forbid_reconciled
  before update on budget_entries
  for each row execute function forbid_reconciled_entry_change();

-- Derived position of every budget. One place computes it, so the family
-- dashboard, the statement and any report all agree.
create or replace view client_budget_positions as
select
  b.id                                              as budget_id,
  b.clinic_id,
  b.client_id,
  b.name,
  b.funding_source,
  b.reference,
  b.currency,
  b.period_start,
  b.period_end,
  b.status,
  b.allocated_amount,
  coalesce(sum(e.amount), 0)                        as spent_to_date,
  b.allocated_amount - coalesce(sum(e.amount), 0)   as remaining,
  case when b.allocated_amount > 0
       then round((coalesce(sum(e.amount), 0) / b.allocated_amount) * 100, 1)
       else 0 end                                   as percent_used,
  count(e.id)                                       as entry_count,
  count(e.id) filter (where not e.reconciled)       as unreconciled_count,
  max(e.entry_date)                                 as last_entry_date
from client_budgets b
left join budget_entries e on e.budget_id = b.id
group by b.id;

-- RLS: staff work within their clinic; families read their own budgets
-- through the client portal's existing client-access path.
alter table client_budgets enable row level security;
alter table budget_entries enable row level security;

create policy client_budgets_staff_read on client_budgets for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
create policy client_budgets_staff_write on client_budgets for insert
  with check (clinic_id = auth_clinic_id() and auth_is_staff());
create policy client_budgets_staff_update on client_budgets for update
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy budget_entries_staff_read on budget_entries for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
create policy budget_entries_staff_write on budget_entries for insert
  with check (clinic_id = auth_clinic_id() and auth_is_staff());
create policy budget_entries_staff_update on budget_entries for update
  using (clinic_id = auth_clinic_id() and auth_is_staff());

-- Families read their own budgets and statement lines, using the same
-- client-role path migration 0020 established for programs and notes.
create policy client_budgets_client_read on client_budgets for select
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id());

create policy budget_entries_client_read on budget_entries for select
  using (
    public.auth_role() = 'client'
    and budget_id in (
      select id from client_budgets where client_id = public.auth_client_row_id()
    )
  );
