# @summit/family

What a signed-in parent may see of their children, as pure TypeScript.

`apps/client` (the family portal on the web) and `apps/mobile` (the family app
on a phone) both answer the same questions — which children, what may I show of
each, which day counts as today at the clinic — and they must answer them
identically. A second copy of "does this parent hold `view_billing`" is how one
surface offers a tab the other refuses.

**No React, no DOM, no Supabase, no `next/*`.** That is what lets React Native
consume it; see CLAUDE.md's rule on what `apps/mobile` may take from
`packages/`. Anything that needs a browser — remembering the last viewed child
in `localStorage`, the server-readable cookie — stays in the app that has one.

## What this is and is not

This is **UX**. `permissions` here decides what a portal OFFERS: a parent
without billing access should not be shown an invoices tab that would fail.

It is **not the enforcement point**. RLS is. `auth_guardian_can(client_id,
permission)` in the database is what actually refuses a read, and the suites in
`supabase/tests` assert that a parent who edits the URL, or the request, still
gets nothing. **If this package and the database ever disagree, the database is
right.**
