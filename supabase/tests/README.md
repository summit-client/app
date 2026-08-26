# RLS behaviour tests

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
