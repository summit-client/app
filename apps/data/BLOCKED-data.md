# Blocked items — apps/data hardening pass (round 2)

Items that could not be fixed inside `apps/data` because the real fix
requires a `packages/`, `supabase/migrations/`, or other shared-file change,
out of scope for this branch by instruction. Logged here instead of fixed.

This round went deeper on feature work per an explicit follow-up request:
several things round 1 left as "local-only prototype, not exploitable, out
of scope" are now wired to real Supabase persistence where the existing
schema already supports it (no migration needed) — see the PR description
for the full list. What's below is what remains genuinely blocked.

---
