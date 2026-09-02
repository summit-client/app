-- 0051 · Reads that admitted families to staff data
--
-- Found by a sweep rather than by inspection: read every table in the schema
-- as a signed-in family member with no relationship to anyone, and see what
-- comes back. Seven tables did.
--
-- ===========================================================================
-- THE ONE THAT MATTERS · profiles
-- ===========================================================================
--
--   profiles_clinic_read: clinic_id is not null and clinic_id = auth_clinic_id()
--
-- Every signed-in account in a clinic could read every profile row in that
-- clinic. A parent could enumerate:
--
--   * every staff member, by name, with their role - admin, hr_admin,
--     payroll_admin, scheduler, supervisor, clinician
--   * every OTHER FAMILY's account name and role
--
-- The second is the serious half. In a children's services clinic, "who else
-- is a client here" is not a question the portal should answer, and a parent
-- reading a neighbour's name off their own portal is a disclosure no consent
-- form covers.
--
-- The policy reads like tenant scoping and is - it is correctly scoped to one
-- clinic. It was never scoped to a role, and every family account carries a
-- clinic_id.
--
-- A family needs exactly one profile row: their own, which profiles_self_read
-- already grants. Staff names for the care team come from my_care_team()
-- (0050), which returns a name and a job title and deliberately not a role.
-- Nothing in apps/client reads profiles beyond `.eq("id", user.id)`.
drop policy if exists profiles_clinic_read on profiles;
create policy profiles_clinic_read on profiles for select
  using (
    clinic_id is not null
    and clinic_id = public.auth_clinic_id()
    -- The clause that was missing. Staff work with each other and need the
    -- roster; families do not.
    and public.auth_is_staff()
  );

comment on policy profiles_clinic_read on profiles is
  'Staff read their colleagues. Families read only their own row, through '
  'profiles_self_read - without the auth_is_staff() clause a parent could '
  'enumerate every staff member and every other family in the clinic.';

-- ===========================================================================
-- The rest · operational reference data
-- ===========================================================================
--
-- These are all "any signed-in user" reads. None carries a family's data and
-- none is a disclosure in the way profiles was, but none is anything a family
-- has a use for either, and the payroll ones describe how the clinic pays its
-- staff:
--
--   pay_periods              the payroll calendar
--   minimum_wage_rates       the wage floor payroll is checked against
--   activity_codes           the internal activity vocabulary
--   organization_event_types the internal event vocabulary
--   public_holidays          the holiday calendar payroll uses
--
-- Narrowed to staff. Not because a family reading a public holiday table is a
-- breach, but because "any signed-in user" is the wrong default in a schema
-- where signed-in users include the families being served, and the sweep will
-- otherwise flag these forever.
drop policy if exists pay_periods_read on pay_periods;
create policy pay_periods_read on pay_periods for select
  using (clinic_id = public.auth_clinic_id() and public.auth_is_staff());

drop policy if exists minimum_wage_rates_read on minimum_wage_rates;
create policy minimum_wage_rates_read on minimum_wage_rates for select
  using (public.auth_is_staff());

drop policy if exists organization_event_types_read on organization_event_types;
create policy organization_event_types_read on organization_event_types for select
  using (public.auth_is_staff());

drop policy if exists activity_codes_read on activity_codes;
create policy activity_codes_read on activity_codes for select
  using (
    public.auth_is_staff()
    and (clinic_id is null or clinic_id = public.auth_clinic_id())
  );

drop policy if exists public_holidays_read on public_holidays;
create policy public_holidays_read on public_holidays for select
  using (
    public.auth_is_staff()
    and (clinic_id is null or clinic_id = public.auth_clinic_id())
  );

-- `clinics` is deliberately left alone. A family reading their own clinic's
-- row gets the name, address and phone that already appear on their letters
-- and receipts, and the policy is `id = auth_clinic_id()` - their clinic and
-- no other.
