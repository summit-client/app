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
