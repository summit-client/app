-- 0034 · Who a receipt is from, where it was delivered, and who signed it
--
-- A client-facing receipt carries three different identities, and they are
-- routinely collapsed into one "clinic name" field, which is why receipts get
-- rejected by insurers:
--
--   the ORGANIZATION   the legal entity being paid. Its registered name (which
--                      is often not its trading name) and, where it charges
--                      HST, its business number. One per clinic.
--
--   the SITE           where the service was actually delivered. An
--                      organization with three locations issues receipts
--                      showing the location the client attended, not head
--                      office. Many per clinic.
--
--   the PRACTITIONER   who delivered it: name, credential, registration
--                      number, signature. Many per clinic, and the only one of
--                      the three that belongs to a person rather than to the
--                      organization.
--
-- Each is edited in a different place by a different person, which is what
-- makes them three things rather than one form:
--
--   organization   Settings, by an administrator
--   sites          Settings, by an administrator
--   signature      My Profile, by the practitioner THEMSELF and nobody else
--
-- That last one is not a permissions nicety. A signature applied by someone
-- other than its owner is a forged signature, so the policies below make it
-- impossible rather than discouraged — there is no path by which an admin can
-- write another person's signature, deliberately.

-- ---------------------------------------------------------------------------
-- 1. The organization
--
-- `clinics` has carried only a name and a slug since 0001. A receipt needs
-- more than a name, and an address that lives in a settings blob rather than a
-- column cannot be joined to when the receipt is generated.
-- ---------------------------------------------------------------------------
alter table clinics add column if not exists legal_name text;
alter table clinics add column if not exists address_line1 text;
alter table clinics add column if not exists address_line2 text;
alter table clinics add column if not exists city text;
alter table clinics add column if not exists province text;
alter table clinics add column if not exists postal_code text;
alter table clinics add column if not exists country text not null default 'Canada';
alter table clinics add column if not exists phone text;
alter table clinics add column if not exists email text;
-- Canadian receipts show the HST/GST registration number when tax is charged.
-- Free text: the format differs by registration type, and a check constraint
-- that rejects a valid number is worse than no constraint.
alter table clinics add column if not exists business_number text;

comment on column clinics.legal_name is
  'The registered legal name, where it differs from the trading name in '
  'clinics.name. Receipts show this one; screens show clinics.name.';
comment on column clinics.business_number is
  'HST/GST registration number, shown on receipts where tax is charged. Free '
  'text because the format varies by registration type.';

-- ---------------------------------------------------------------------------
-- 2. Sites
--
-- `locations` already holds name + address + clinic_id, so the multi-site part
-- of this needs no new table — only structured address parts (an address in
-- one free-text line cannot be laid out on a receipt) and a way to say which
-- site a receipt defaults to.
-- ---------------------------------------------------------------------------
alter table locations add column if not exists address_line1 text;
alter table locations add column if not exists address_line2 text;
alter table locations add column if not exists city text;
alter table locations add column if not exists province text;
alter table locations add column if not exists postal_code text;
alter table locations add column if not exists phone text;
alter table locations add column if not exists is_default_for_receipts boolean not null default false;
alter table locations add column if not exists show_on_receipts boolean not null default true;

comment on column locations.address is
  'The original single-line address, kept as written. The structured parts '
  'added in 0034 are what a receipt lays out; this remains the source for '
  'anything that still reads one line.';
comment on column locations.show_on_receipts is
  'A location that is not a service address — a mailbox, a storage unit, a '
  'virtual-only entry — should not be offerable as a receipt footer.';

-- Exactly one default per clinic. A partial unique index rather than a check,
-- so the second default is refused at write time instead of discovered when a
-- receipt picks an arbitrary one of two.
create unique index if not exists locations_one_receipt_default
  on locations(clinic_id) where is_default_for_receipts;

-- ---------------------------------------------------------------------------
-- 3. The practitioner's signature
--
-- Stored as an image data URI. Not a filename, not a path into storage: a
-- receipt has to render years later, and a signature that depends on a bucket
-- object still existing is a receipt that silently loses its signature.
--
-- Superseded rather than updated. A signature is evidence about a document
-- issued on a date; replacing the row would retroactively change what every
-- past receipt appears to have been signed with. Receipts resolve the
-- signature that was current on the date they cover.
-- ---------------------------------------------------------------------------
create table if not exists employee_signatures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- data:image/png;base64,... — checked here rather than trusted, because this
  -- string is rendered into a document.
  image_data_uri text not null
    constraint employee_signatures_is_image
    check (image_data_uri like 'data:image/png;base64,%'
        or image_data_uri like 'data:image/jpeg;base64,%'
        or image_data_uri like 'data:image/svg+xml;base64,%'),

  -- What the person typed as their name alongside the mark, so a receipt can
  -- print a legible name under an illegible signature.
  signed_name text not null,

  effective_from date not null default current_date,
  superseded_at timestamptz,

  created_at timestamptz not null default now(),
  -- Always the owner. Enforced by the trigger below as well as by RLS.
  created_by uuid not null references auth.users(id),

  constraint employee_signatures_size check (length(image_data_uri) <= 400000)
);

create index if not exists employee_signatures_user_idx
  on employee_signatures(user_id, effective_from desc);
create unique index if not exists employee_signatures_one_current
  on employee_signatures(user_id) where superseded_at is null;

comment on table employee_signatures is
  'A practitioner''s signature, for receipts and signed documents. Only the '
  'owner may create one. Superseded rather than replaced, so a document issued '
  'last year still resolves the signature that was current then.';

-- Nobody signs for anyone else. RLS says so; this says so again for the
-- service role, which RLS does not constrain.
create or replace function public.employee_signatures_own_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'A signature can only be created by the person it belongs to.';
  end if;
  if auth.uid() is not null and new.created_by <> auth.uid() then
    raise exception 'A signature must record its own author.';
  end if;
  return new;
end $$;

drop trigger if exists employee_signatures_own on employee_signatures;
create trigger employee_signatures_own
  before insert on employee_signatures
  for each row execute function public.employee_signatures_own_only();

alter table employee_signatures enable row level security;

drop policy if exists employee_signatures_own_read on employee_signatures;
create policy employee_signatures_own_read on employee_signatures for select
  using (user_id = auth.uid());

-- Whoever issues receipts needs to render the signature of the clinician who
-- delivered the service. Read-only, clinic-scoped, and gated on the finance
-- action rather than on any HR one: this is not an HR record.
drop policy if exists employee_signatures_receipt_read on employee_signatures;
create policy employee_signatures_receipt_read on employee_signatures for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.budget.read'));

drop policy if exists employee_signatures_own_write on employee_signatures;
create policy employee_signatures_own_write on employee_signatures for insert
  with check (user_id = auth.uid() and clinic_id = public.auth_clinic_id());

-- Superseding is the only update, and only of your own.
drop policy if exists employee_signatures_own_supersede on employee_signatures;
create policy employee_signatures_own_supersede on employee_signatures for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No delete policy. A signature that signed something is not deletable.

-- ---------------------------------------------------------------------------
-- 4. The receipt itself, assembled
--
-- One view, so the credential number on a receipt is READ rather than passed
-- in by a caller who might send the wrong one. Every field a Canadian
-- insurance receipt is asked for, resolved from the charge outward.
--
-- Deliberately per-charge rather than per-receipt: a receipt is a date range
-- of these lines, and letting the caller choose the range is what makes one
-- receipt-per-session and one receipt-per-month the same query.
-- ---------------------------------------------------------------------------
create or replace view receipt_lines as
select
  be.id                                   as entry_id,
  be.clinic_id,
  cb.client_id,
  cl.name                                 as client_name,
  be.entry_date,
  be.description                          as service,
  be.service_type,
  be.quantity,
  be.unit_rate,
  be.amount,
  cb.currency,
  cb.funding_source,

  -- The organization
  coalesce(c.legal_name, c.name)          as organization_name,
  c.name                                  as organization_trading_name,
  c.business_number,
  c.address_line1                         as org_address_line1,
  c.address_line2                         as org_address_line2,
  c.city                                  as org_city,
  c.province                              as org_province,
  c.postal_code                           as org_postal_code,
  c.phone                                 as org_phone,

  -- The site the service was delivered at, falling back to the clinic's
  -- default receipt site when the session did not record one.
  coalesce(site.id, dflt.id)              as site_id,
  coalesce(site.name, dflt.name)          as site_name,
  coalesce(site.address_line1, dflt.address_line1, site.address, dflt.address) as site_address_line1,
  coalesce(site.address_line2, dflt.address_line2) as site_address_line2,
  coalesce(site.city, dflt.city)          as site_city,
  coalesce(site.province, dflt.province)  as site_province,
  coalesce(site.postal_code, dflt.postal_code) as site_postal_code,
  coalesce(site.phone, dflt.phone)        as site_phone,

  -- The practitioner
  pr.id                                   as clinician_user_id,
  pr.full_name                            as clinician_name,
  cred.credential                         as clinician_credential,
  cred.credential_number                  as clinician_credential_number,
  sig.image_data_uri                      as clinician_signature,
  sig.signed_name                         as clinician_signed_name
from budget_entries be
join client_budgets cb on cb.id = be.budget_id
join clinics c on c.id = be.clinic_id
left join clients cl on cl.id = cb.client_id
left join sessions s on s.id = be.session_id
left join locations site on site.id = s.location_id
left join lateral (
  select l.* from locations l
   where l.clinic_id = be.clinic_id and l.is_default_for_receipts
   limit 1
) dflt on true
left join employment_records er
  on er.staff_id = s.employee_id
 and er.clinic_id = be.clinic_id
 and er.start_date <= be.entry_date
 and (er.end_date is null or er.end_date >= be.entry_date)
left join profiles pr on pr.id = er.user_id
-- The credential in good standing with the furthest renewal, matching what the
-- employee portal calls primary. A lapsed credential never reaches a receipt.
left join lateral (
  select ec.credential, ec.credential_number
    from employee_credentials ec
   where ec.user_id = er.user_id
     and ec.status = 'GOOD_STANDING'
     and ec.credential_number is not null
   order by ec.cycle_end desc
   limit 1
) cred on true
-- The signature that was current on the date of the charge, not today's.
left join lateral (
  select es.image_data_uri, es.signed_name
    from employee_signatures es
   where es.user_id = er.user_id
     and es.effective_from <= be.entry_date
   order by es.effective_from desc
   limit 1
) sig on true
where be.kind = 'CHARGE';

comment on view receipt_lines is
  'Everything a client-facing receipt needs, per charge. The credential number '
  'and signature are resolved here rather than passed in, so a receipt cannot '
  'be issued carrying someone else''s number. Charges only: a credit is not a '
  'receipt line, it is an adjustment to one.';

-- What is still missing before a receipt can be issued, in words. Same shape
-- as deployment_readiness in 0033, and for the same reason: a receipt that
-- renders with three blank fields is worse than one that refuses.
create or replace view receipt_readiness as
select
  c.id                                    as clinic_id,
  c.name                                  as clinic_name,
  (c.address_line1 is null)               as missing_org_address,
  (c.legal_name is null)                  as missing_legal_name,
  not exists (select 1 from locations l
               where l.clinic_id = c.id and l.is_default_for_receipts)
                                          as missing_default_site,
  case
    when c.address_line1 is null
      then 'No organization address. A receipt cannot show who it is from.'
    when not exists (select 1 from locations l
                      where l.clinic_id = c.id and l.is_default_for_receipts)
      then 'No default receipt site. Sessions without a recorded location would have no address to show.'
    when c.legal_name is null
      then 'No legal name recorded, so receipts will show the trading name. Fine if they are the same.'
    else 'ready'
  end                                     as blocker
from clinics c;
