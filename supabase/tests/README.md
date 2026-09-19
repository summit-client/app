# Database tests

Two kinds, with different requirements.

## Schema and behaviour tests — no install needed

`apply.mjs` and `behaviour.mjs` run against PGlite, a real Postgres compiled to
WASM. No server, no `initdb`, no Docker.

    cd supabase/tests
    npm install
    npm run apply       # every migration, in order, against an empty database
    npm run behaviour   # permissions, the HR boundary, ESA overtime, budgets

`apply.mjs` is the answer to "can this repo build a database from nothing",
which until migration `0000` it could not. `behaviour.mjs` exercises the rules
that cost money or leak data if they are wrong.

**The ESA overtime cases in `behaviour.mjs` are deliberately the same cases as
`packages/workforce/esa.test.ts`.** One rule is implemented twice — once in SQL
for reporting, once in TypeScript so a screen can compute before saving — and
the only thing that makes that safe is both being checked against one
specification. If you change either, change both, and run both.

Two things PGlite cannot do, so neither script tests them:

- **RLS enforcement.** Everything runs as the superuser, who bypasses row
  security. Policies are verified as creatable and the functions they call are
  verified directly; whether a policy actually filters for a given JWT needs
  the psql path below.
- **`btree_gist`.** Not bundled, so the three exclusion constraints that need
  it (`employment_positions`, `pay_periods`, `pay_rates` overlap guards) are
  stripped for the run and reported as unverified. They are fine on Supabase.

## Tenancy doctrine — one run with no credentials, one with

    cd supabase/tests
    node tenancy.mjs ../migrations           # reads the migration files
    node tenancy.mjs ../migrations --live    # reads the live database

Every PHI table carries `clinic_id` and every policy on one names it. That is
the rule in CLAUDE.md; this is the thing that checks it, and both runs are in
CI.

**The file run cannot see the database, and that limit is not theoretical.** On
2026-09-18 it reported `sessions` cleanly scoped while production carried two
policies with no clinic predicate that appear in no migration in this repo. A
policy added in the dashboard, a migration applied out of order, anything older
than this history — the files know nothing about any of it. So the live run is
the one that matters, and a live run that is skipped must fail rather than
report green.

### The credential for the live run

Two are accepted, and which one you use is a security decision.

`SUPABASE_DB_URL` — a Postgres connection string. **Use this one.** Point it at
a role that can log in and read catalogs and nothing else. Policy definitions,
table lists and function bodies are readable without a grant on a single
application table, so that role needs none. If the string leaks, somebody
learns what your policies say: no PHI, no writes, no other project.

`SUPABASE_ACCESS_TOKEN` — a Supabase personal access token (`sbp_…`). It works
and the suite only ever issues SELECTs, but the token itself is **account-wide
and can write**. Anyone who can edit a workflow file in a pull request can
print a secret the workflow binds. Reasonable on your own machine; a poor thing
to store in CI.

The suite prefers `SUPABASE_DB_URL` when both are set, and prints a warning
when it falls back to the token.

### Creating the scoped role

Run this in the SQL editor. **Pick your own password — nothing in this repo,
and nobody working in it, should ever see it.**

```sql
create role tenancy_audit with login password 'PUT-A-LONG-RANDOM-PASSWORD-HERE';
grant connect on database postgres to tenancy_audit;
grant usage on schema public to tenancy_audit;
```

That is the whole grant. No `select` on any table, ever — the suite reads
`pg_policies`, `pg_class`, `pg_attribute` and `pg_proc`, which are world-
readable in Postgres. Confirm the role really is powerless before you trust it:

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m')
      and has_table_privilege('tenancy_audit', c.oid, 'select'))   as tables_it_can_read,
  has_database_privilege('tenancy_audit','postgres','connect')     as can_connect,
  (select rolbypassrls from pg_roles where rolname='tenancy_audit') as bypasses_rls;
```

Want `0, true, false`. If `tables_it_can_read` is anything but zero, stop and
fix the grants — a suite running with table access is a credential in CI that
can read PHI.

**Do not verify this with `set role tenancy_audit`.** The Supabase dashboard's
SQL Editor does not run as `postgres`, so it cannot switch into a role even
though `postgres` owns it: you get `42501: permission denied to set role`.
The trap is what happens next — the `set role` fails, the rest of the script
runs as the Editor's own admin role, and `select count(*) from public.clients`
returns a row count that looks exactly like the powerless role reading your
PHI. It is not; it is the Editor reading it, as it always could.
`has_table_privilege()` asks Postgres the question directly and cannot be
misread that way.

Then build the connection string from Supabase's **Connection pooling** tab
(Settings → Database), not the direct one — GitHub's runners are IPv4-only and
the direct host is IPv6-only, so a direct string times out there with no useful
error. Substitute the role and its password into the pooler's host and port:

    postgresql://tenancy_audit.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

Store it as the `SUPABASE_DB_URL` repository secret under Settings → Secrets
and variables → Actions. The runner has `psql` preinstalled; nothing else is
needed.

**Rotate it by dropping the role**, not by editing the secret alone:

```sql
drop role tenancy_audit;
```

### Reading the output

`known` is a baseline of policies already found unscoped and not yet fixed.
**It is currently empty**, and should stay that way: migration 0087 closed all
six it once held, confirmed against production on 2026-09-18.

That emptiness is load-bearing. An entry in `KNOWN` is a policy the suite will
not fail on, so a stale entry silently excuses the exact thing it was written
to flag. With it empty, putting any of those six policies back unscoped turns
the run red today. If you add one, say what holds the boundary up and what
would close it, and treat it as a debt with a date.

## Edge Function authorization — no install needed

    node supabase/tests/edit_teammate_authz.mjs
    node supabase/tests/invite_teammate_guard.mjs

Edge Functions are deployed separately from the apps and are covered by neither
`pnpm turbo build` nor any typecheck script, so nothing else in this repo
checks them. Both suites read their rules out of the functions' own source, so
neither can pass against a stale copy, and neither needs a database. CI runs
both.

`edit_teammate_authz.mjs` drives `edit-teammate`'s two role matrices as a
decision table. The matrices are the whole authorization decision.

`invite_teammate_guard.mjs` covers the check that stops an invite overwriting
an existing account. That guard's correctness is mostly its *position* in the
file: a trigger creates a default `profiles` row the instant any `auth.users`
row appears, including the one `inviteUserByEmail` creates, so the same query
that catches a pre-existing account before the invite would reject every
legitimate invite after it. The suite asserts on source offsets for that
reason.

**Both suites were mutation-tested rather than just run.** Breaking each rule
in a scratch copy of the function must turn a PASS into a FAIL — that is the
only thing separating a test from a paragraph that returns zero. One assertion
here was found worthless that way: it matched an unrelated supervisor check
elsewhere in the same window and reported the rule intact after the rule had
been deleted. If you add an assertion, break the thing it covers and watch it
fail before you trust it.

## RLS behaviour tests — needs a real Postgres

These are not run by CI. They are here so a policy change can be checked against
a real Postgres instead of read and hoped over.

    apt-get install -y postgresql
    export PATH=/usr/lib/postgresql/16/bin:$PATH
    initdb -D /tmp/pgd -A trust && pg_ctl -D /tmp/pgd -o '-k /tmp -p 5433' start
    createdb -h /tmp -p 5433 summit
    psql -h /tmp -p 5433 -d summit -f _harness.sql      # auth.users, profiles, scheduler stubs
    for f in ../migrations/00*.sql; do psql -h /tmp -p 5433 -d summit -f $f; done
    psql -h /tmp -p 5433 -d summit -f _fixtures.sql     # one clinic, one employee, one supervisor
    psql -h /tmp -p 5433 -d summit -f _try.sql          # the try() helper
    psql -h /tmp -p 5433 -d summit -f hub_certificates_rls.sql

**Read the row counts, not just the errors.** A policy that blocks an UPDATE or
DELETE does not raise - it matches zero rows and reports success. `try()` prints
NO-OP for that case, which is the difference between a passing test and a
worthless one. An INSERT blocked by a policy *does* raise; that is why the two
look different in the output.

Expected for hub_certificates: employees upload and correct their own outside
certificates; they cannot forge a SUMMIT_ISSUED row, cannot type a SUMMIT-
registry number, cannot verify themselves, and cannot edit a record once a
manager has verified it. Nobody deletes anything.
