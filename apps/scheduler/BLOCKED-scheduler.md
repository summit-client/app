# Blocked items — apps/scheduler hardening pass

Things that need a migration, a `packages/` change, or a new dependency,
which this session is not allowed to make. Each entry says what was done
instead, if anything.

## 2026-09-02 full audit pass — summary

Full audit + stress test ahead of tomorrow's demo (booking, calendars,
matching, RLS, dead code, leak tests). Re-verified migrations `0045`
(double-booking) and `0046` (clinician self-only booking access) — both are
correct and hold under a real, RLS-enforcing Postgres, but **neither has
been applied to the live database yet** (see the bold warning under item 1
below - this is the single most important thing in this file for tomorrow).
Found one new, real compliance gap (item 0, below - PHI sent to Anthropic)
that needs a product/legal call, not a code fix from this pass. Deleted
`dump.txt`/`index_dump.txt` (item 6 - confirmed no unique value, see that
item for how). Added automated test coverage that didn't exist before
tonight: `supabase/tests/behaviour.mjs` gained 8 checks directly exercising
migration `0045`'s trigger and unique index (exact duplicate, duration-aware
overlap, back-to-back boundary, cancelled-slot reuse, cross-clinician
independence, null-type fallback, unassigned-session non-conflict) - nothing
in the suite touched this migration before, `apply.mjs` only proved the DDL
parses. Full harness re-run clean: `apply.mjs` 46/46, `behaviour.mjs` 68/68
(61 + 8 new), `rls.mjs` 41/41 (unchanged - already covered 0046 thoroughly).
Everything else audited and found solid: every `.from(` call in the app maps
to a covered RLS policy; every clinician-facing write button (`SessionDetail`,
`SessionsView`, `CalendarView` drag-to-reschedule) is gated by the same
`canManageSession`-shaped ownership check and *omits* the button rather than
disabling it; the `?view=` router param, `pages/admin.tsx`, and the AI
matching candidate pool are all correctly narrowed for a clinician (the
"second `/admin`-shaped bug" this task asked to check for - not found, this
one's already handled); no PHI in URLs, `localStorage`, or console logs; no
orphaned components or TODO/FIXME markers; conflict messages are friendly
text, not raw Postgres errors; required-field guards and double-click
protection (`booking`/`saving` state disabling the button synchronously)
are in place on every write path. No Playwright/mock-Supabase-server
harness exists anywhere in this repo yet (checked `git log` per this task's
own instruction before assuming one did) - stress-testing here was done by
reading every write path plus the real-Postgres RLS/trigger suites above,
not a browser session; flagging that gap explicitly rather than silently
skipping the ask.

## 0. AI matching sends a client's real name to Anthropic — compliance gap, not fixed here

**Found this pass, not introduced by it - pre-existing on `main`.** CLAUDE.md's
hard constraints are explicit: *"Never send identifiable data to a
third-party model without a signed agreement covering it. `packages/clinical-ai`
routes PHI to Azure OpenAI by default for this reason; Anthropic is only used
for non-PHI scheduler matching."* The single-client branch of `runMatch()`
(`pages/index.jsx:1897`) violates that:

```js
prompt = `You are an ABA scheduling assistant. Find the best staff match for a client.
CALENDAR: ${selectedCalendar.name} (${selectedCalendar.date_start} to ${selectedCalendar.date_end})
CLIENT: ${selectedClient.name} | SESSION: ${selectedSessionType.name} (${selectedSessionType.duration}min)
...
```

`selectedClient.name` - a real client's real name, i.e. "this named person
receives ABA therapy at this clinic," which is PHI under PHIPA - goes straight
into the prompt body, which `/api/match` forwards verbatim to
`api.anthropic.com`. This is exactly the failure mode the "non-PHI scheduler
matching" line in CLAUDE.md is written to prevent, and it's live in
production right now (this branch is what "Find matches" hits for a single
client; nothing gates it behind a flag).

**Not a leak from *this* app's UI/RLS layer to *this* app's own users** - the
audit's other leak tests (URLs, console, cross-clinic, cross-role) all came
back clean. This is a leak to a third party the clinic hasn't signed a PHI
agreement with, which is a different and arguably worse category.

**Why this pass didn't just fix it:** the mechanical fix (drop
`selectedClient.name` from the prompt, matching text) is easy, but *what to
send instead* is a product call, not a coding one - the recommendation text
the AI returns currently references the client by name too
(`"recommendation":"..."`), and the UI likely expects that. Options range
from "send a non-identifying placeholder and re-substitute the real name
client-side after the response comes back" to "route this call through
`packages/clinical-ai`'s Azure path instead of Anthropic, like every other
PHI-adjacent AI call in this codebase already does" - the latter looks like
the more correct fix on its face (it's the exact mechanism CLAUDE.md
describes existing for this reason) but changes which service and API key
this feature bills against, which isn't this session's call to make
unilaterally the night before a demo. The multi-client branch of the same
wizard (`type !== "single"`) is NOT affected - it never calls `/api/match`
at all, matching is done entirely client-side there.

**Suggested next step for whoever picks this up:** decide whether
single-client AI match should (a) route through `packages/clinical-ai` /
Azure instead of the direct Anthropic call in `pages/api/match.ts`, or (b)
stay on Anthropic but strip every identifying field from the prompt
(`selectedClient.name`, and check `selectedCalendar.name` too if clinics ever
name calendars after clients) and reattach the real name client-side to the
response before display. Either way, `match.ts`'s own header comment
("Anthropic... non-PHI scheduler matching") already states the intended
invariant; this is the one call site that doesn't meet it.

## 1. Booking-integrity: no DB constraint against double-booking a clinician

**Re-verified 2026-09-02 (full audit pass): the migration is correct, and it
is STILL NOT APPLIED TO THE LIVE DATABASE.** This is the single most
important line in this file for tomorrow's demo. `supabase/migrations/0045_sessions_no_double_booking.sql`'s
own header says so explicitly ("NOT applied by this session - the Supabase
MCP available here is read-only. A human needs to run this migration against
the live database.") and nothing in this repo's history since shows a human
having done that - this session's own Supabase MCP access was also
unavailable (see CLAUDE.md's "If `ToolSearch` for 'supabase' comes back
empty" note; confirmed empty again this pass), so there was no way to check
the live schema directly either. **Assume the double-booking race is still
live in production until someone confirms otherwise** by running
`select indexname from pg_indexes where tablename='sessions' and indexname='sessions_no_exact_double_book'`
(or just applying the migration - every statement in it is `if not exists`/
`create or replace`, safe to run twice).

What's newly true this pass: the migration now has real automated test
coverage, which it didn't before tonight - `supabase/tests/behaviour.mjs`
gained 8 checks that apply the full 46-migration chain to a fresh Postgres
(via PGlite) and exercise the trigger and unique index directly: exact-slot
duplicate refused, a 9:30 start correctly overlaps a 9:00-10:00 session,
back-to-back sessions touching exactly at the boundary are allowed, a
cancelled session frees its slot, two different clinicians at the identical
slot never conflict, an unrecognized `type` falls back to the same 60-minute
default the app uses, and an unassigned (`employee_id is null`) session never
conflicts with anything. All 8 pass (`npm run behaviour` in `supabase/tests`,
68/68 total including the pre-existing 61). This replaces the previous ad
hoc, uncommitted verification the item below describes ("a minimal mirror of
the real schema... NOT the live Supabase project") with something that runs
again on every future change to this table.

**Original verification note, kept for context (this pass didn't need to
redo it, just add automated coverage for it):** Implements exactly the two
layers sketched below: the partial
unique index for the exact-slot case, and a `before insert or update` trigger
(plain plpgsql, not `security definer`, matching migration `0016`'s four
trigger functions on this same table) for the overlapping-but-not-identical
case, computing each row's `tsrange` from `session_date`/`hour`/`minute` and
`session_types.duration` (looked up by `(clinic_id, type)` since `type` is a
denormalized name, not a foreign key - same join shape migration `0029`
already uses). Verified by applying the migration to an isolated local
Postgres instance in this sandbox against a minimal mirror of the real
`sessions`/`session_types`/`staff` schema (NOT the live Supabase project) and
exercising it with real inserts/updates: exact duplicates and duration-aware
overlaps both correctly fail (the overlap trigger fires first and already
subsumes the exact-duplicate case in practice, so the unique index mostly
acts as a second, independent layer rather than the one that actually fires -
still worth keeping per this file's own suggestion below), back-to-back
sessions touching at the boundary correctly succeed, a cancelled row frees
its slot, unrelated clinicians never conflict, and a null/unrecognized `type`
correctly falls back to the same 60-minute default the app itself uses. Not
verified against the live database itself - that needs the human-run
migration plus real app traffic.

App-side: every write site this file's own list below still has under
`main` (confirmed unchanged in shape by the concurrent `overnight/
scheduler-issue-133` pass, which touched the same calendar files for other
reasons) now recognizes a 23505/23P01 write error from this constraint and
shows the same friendly "that slot was just booked by someone else" message
the existing fresh-pre-check already shows, instead of a raw Postgres error -
see `lib/checkSlotConflict.ts`'s `isBookingConflictError` and its call
sites in `pages/index.jsx`, `components/calendar/CalendarView.tsx`, and
`components/calendar/RescheduleModal.tsx`. `pages/index.jsx`'s
`submitReschedule` (the reschedule mini-calendar's own write, mentioned in
this file's header comment but not in this item's original list) got the
same treatment, being the same shape of gap.

**Original analysis, kept for context:**

Nothing in the `sessions` table prevents two rows
from sharing the same `employee_id` + `session_date` + `hour` + `minute` (or
from overlapping once each session type's duration/gap is taken into
account). Every create/move path in this app (`insertQuickSlot`,
`handleConfirmAndBook`, `bookQuickSlot`, `CalendarView`'s
`applyReschedule`, `RescheduleModal`'s `handleSave`) only ever checked for a
conflict against React state that can be stale for as long as the page or a
modal has been open, then wrote with no re-validation at all - a
read-then-write race. Two concurrent requests (two schedulers, or one
scheduler with two tabs) hitting the same slot within that window can both
pass the same check and both write, double-booking a clinician.

**What this pass did, within its limits (no migrations, no Supabase
writes):** added `lib/checkSlotConflict.ts` and wired a *fresh* database
re-check immediately before every write in the five paths above, in
addition to (not instead of) the existing state-based check. This shrinks
the staleness window from "since the page/modal loaded" to "since this one
request," which closes the overwhelmingly likely case, but it is not
airtight - two writes issued within the same round trip can still both pass
the fresh check and both succeed.

**What actually closes it:** a database constraint, the same shape as
migration `0016`'s cross-clinic reference trigger on this same table.
Concretely, something like:

```sql
-- Exact-slot double-booking (the common case: two requests targeting the
-- literal same grid cell for the same clinician).
create unique index sessions_no_exact_double_book
  on sessions (employee_id, session_date, hour, minute)
  where status <> 'cancelled';
```

That alone doesn't cover overlapping-but-not-identical slots once a session
type's `duration_minutes` is longer than the grid increment (e.g. a 60-minute
session starting at 9:00 and another starting at 9:15 for the same
clinician don't collide on the unique index above but do overlap in time).
Closing that fully needs either an exclusion constraint over a computed
`tsrange` (`btree_gist` extension, `exclude using gist (employee_id with =,
tsrange(...) with &&) where (status <> 'cancelled')`) or a
`before insert or update` trigger that queries for any overlapping row and
raises, mirroring `0016`'s style. Either is a real migration, not something
this session can write per the task's constraints - logging it here instead.

## 1a. Migration `0046` (clinician self-only booking access) is ALSO not applied live

Same status as item 1's migration, checked the same way this pass: `supabase/migrations/0046_clinician_scheduler_access.sql`'s
own closing comment says "APPLY MANUALLY... no Claude session, including the
one that wrote this file, has run this against the live database." Nothing
found in `git log` or either doc in `docs/context/` since PR #148 merged
tonight suggests a human has run it either. Until it is applied, the live
database still has the pre-`0046` policy set: a clinician has **zero**
read access to `session_types`, `locations`, `calendars`,
`client_availability` and `staff_availability` (those five tables' clinician
`select` policies don't exist yet), and **zero** write access to `sessions`
at all (the two new clinician-scoped insert/update policies don't exist
yet). That means a clinician signing into the live scheduler portal right
now would hit exactly the "RLS returns empty sets, not errors" trap CLAUDE.md
warns about on five of eight tables, and every booking/reschedule/cancel
attempt would silently no-op (RLS matches zero rows) rather than succeed -
this is a **materially worse demo failure** than a missing double-booking
guard, because it means the newly-shipped clinician-facing feature this
migration exists for doesn't actually work live yet, full stop, regardless
of how correct the app code and the migration file both are.

Re-verified via the same real-Postgres harness as item 1 (not new to this
pass - `supabase/tests/clinician_scheduler_access.sql`, added alongside the
migration, already covered this; this pass's contribution was re-running it
clean and confirming the harness itself is sound): `npm run rls` in
`supabase/tests` - 41/41, including six checks specifically on 0046's read
parity and write scoping (own-session allowed, colleague's session
invisible-to-write, no self-reassignment to a colleague, unlinked clinician
has read but zero write, admin/scheduler unaffected). The code and the
migration are correct. **The gap is purely operational: someone with
database access needs to run both `0045` and `0046` against the live project
before tomorrow's demo**, ideally together since they're both scheduler-table
changes from the same tonight and worth reviewing as one batch.

## 2. Recurring drag-to-reschedule only conflict-checks the anchor slot

**FIXED in the follow-up pass.** `applyReschedule`'s `"following"`/`"all"`
branch now calls `fetchFreshConflictKeys` over every shifted occurrence's
employee/date/hour/minute before writing any of them, all-or-nothing (the
whole series move is refused, not silently partially applied, if any
occurrence would collide - see the comment at the call site for why
all-or-nothing is the right shape here rather than the per-date skip
pattern batch-booking uses). One accepted, documented limitation remains:
`fetchFreshConflictKeys` has no per-candidate exclusion the way
`fetchFreshConflict`'s `excludeSessionId` does, so two occurrences of the
same series swapping into each other's still-unmoved slot can produce a
rare false-positive collision - fails safe (blocks the move) rather than
corrupting the series, which is the right tradeoff for something this
narrow. Item 1's actual DB constraint is still the only thing that closes
the underlying race outright.

## 3. The Create wizard's preview/availability grids hardcode a 7am-8pm day

**FIXED in the follow-up pass.** `generateTimeSlots()`/`buildPreviewSlots()`
now take `(startHour, endHour)` instead of closing over a hardcoded 7-20
range, and every consumer - `PreviewGrid`, `AvailabilityGrid`, and
`CreateView`'s `runMatch` multi-client matching loop - now derives them
from the `workStart`/`workEnd` props already threaded down from
`Scheduler()` (which already subscribes to `onSettingsChange` for exactly
this reason; `CalendarView.tsx`'s real calendar reads the same underlying
setting independently). `AvailabilityGrid` picked up the same treatment for
its day columns too - it previously always rendered all six of Mon-Sat
regardless of `calendar.workDays`, unlike `PreviewGrid`, which already
filtered correctly; both now agree.

The concern that held this back last pass (a UI-visible change to a grid
this repo's own calendar-v2 history flags as having caused a real
regression before, with no Supabase credentials in this sandbox to verify
live) still applies in spirit - this could not be clicked through in a
browser here either. What changed: `tsc --noEmit`, a full `next build`
(including Turbopack's own TypeScript/bundling pass), and a careful,
mechanical trace of every call site consuming the removed module constants
gave enough confidence to make the change rather than continue deferring
it. Worth a deliberate look in a browser before this reaches production,
same as any other unverified UI change in this pass.

## 3a. `AvailabilityGrid`'s day/hour grid is now settings-driven per render

Not a gap, a note for whoever reviews the change above: the availability
editor's initial `selected` slot state is computed once via
`useState(() => availToSlots(existingAvailability, timeSlots))` at mount,
where `timeSlots` depends on the `workStart`/`workEnd` props current at
that moment. Since this component only ever mounts on a user action (an
already-loaded row's "Edit availability" button) well after
`@summit/settings` has resolved and `Scheduler()` has re-rendered with real
values, this should never actually observe a stale settings snapshot in
practice - flagging the theoretical edge only so it isn't mistaken for
something checked and ruled out.

## 4. Client `session_type` used a hardcoded 4-item list, not this clinic's own

**Multi-tenant hardening finding - fixed this session.** `pages/admin.tsx`
offered exactly four fixed session-type names ("Assessment", "RBA
Supervision", "Direct Therapy", "Group Therapy") for a client's
`session_type` field, identical for every clinic regardless of what that
clinic actually configured in the real, per-clinic-editable `session_types`
table (`SessionTypeEditModal`, migration `0019` - a clinic can rename,
remove, or add its own types there). `fetchAll()` now also loads
`session_types.name` for the signed-in clinic and the dropdown renders from
that instead, falling back to the original four only if a clinic somehow
has no session types configured yet (shouldn't happen post-`0019`, which
seeds a default set per clinic, but kept as a defensive fallback rather
than an empty dropdown).

## 5. Click-to-create's calendar grid has no keyboard path of its own

**FIXED in the follow-up pass, plus the same treatment for existing session
blocks.** `DayColumn` is now itself a tab stop (`role="slider"`,
`aria-orientation="vertical"`) rather than only ever deriving a target time
from `e.clientY`: arrow keys move a focused minute-offset in `snapMinutes`
steps, Home/End jump to the start/end of the work day, and Enter/Space
calls `onSlotClick` at the focused time - the same call a click already
makes. `aria-valuetext` announces the focused time, and `aria-label`
spells out the keys since plain `role="slider"` doesn't define an "Enter
activates" convention on its own. The focus indicator reuses the drag-hover
indicator's exact visual language (a highlighted line plus an exact time
label) instead of inventing a second one, and a mouse click also updates
the keyboard-focus position so Tab/arrow navigation afterward continues
from wherever was just clicked.

While in the same file: `SessionBlock` (an existing session's block) and
`StackedPill`'s collapsed multi-session pill and its expanded list rows
were the identical shape of gap - plain `onClick` divs with no
`tabIndex`/`role`/keydown at all, so an existing session could be seen but
never opened, and a 2+ session stack could never be expanded, by keyboard.
All three now have `tabIndex={0}`, `role="button"`, a real `aria-label`,
and an Enter/Space handler equivalent to their click handler.

The concern that held this back last pass (a UI-visible change to exactly
the component CLAUDE.md's "Scheduler calendar v2" history flags as having
caused a real, previously-undetected regression before - `e.target !==
e.currentTarget` silently killing click-to-create entirely) still applies:
this sandbox still has no Supabase credentials to click through the app in
a browser. What changed here is the same as item 3 above - `tsc --noEmit`,
a full `next build`, and a careful trace of every prior click/drag call
site (`handleColClick`, `handleDragOver`, `handleDrop` all now share one
`snappedOffsetFromY`/`timeFromMinuteOffset` pair instead of the old
`timeFromY`, so their existing mouse/drag behavior is provably unchanged,
not just "probably fine") gave enough confidence to make the change. Worth
a deliberate look in a browser before this reaches production, same as any
other unverified UI change in this pass - in particular, confirm Tab order
through a day with several sessions reads sensibly, and that arrow-key
time selection feels right on a touch/mobile layout where hover isn't a
concept.

## 6. `apps/scheduler/dump.txt` and `index_dump.txt`

**DELETED 2026-09-02 (full audit pass), with explicit confirmation to do so
carried by this pass's own task instructions.** Read both files in full
before deleting, per the standing "not safe to delete without confirming
with Yanko first" note below (kept for the record): both are a single
Windows-path-prefixed concatenation of the scheduler's pre-hardening source
tree (`// === FILE: C:\Users\y_yan\Projects\summit-scheduler\...`,
mojibake-corrupted from an encoding mismatch), including the exact
pre-PR#40 `pages/api/match.ts` this repo's docs already flagged - an
unauthenticated open proxy to `api.anthropic.com` using the server's own API
key, no allowlist, no rate limit, no payload cap. Confirmed superseded and
of no unique value before deleting: the live `pages/api/match.ts` is now
fully hardened (auth + role allowlist + per-user rate limit + pinned
model/token cap, with its own header comment describing exactly what the
dump's version got wrong), the dump's `Sidebar.tsx`/`useUser.ts` reference
the retired `"staff"` role and pre-`clinician`/`supervisor` vocabulary
CLAUDE.md's "One role vocabulary" section documents as long superseded, and
a repo-wide grep turned up zero references to either file from any script,
config, or app code - only the three docs (this file, `AUDIT-2026-08-31.md`,
`docs/context/environments.md`) that flagged them as tracked-despite-
gitignored. Both were already in `apps/scheduler/.gitignore` (added, never
honoured because the files were already tracked before the ignore rule was
added) - `git rm` clears that mismatch too.

**Original note, kept for the record:** Pre-existing, unrelated to the pass
that first flagged this. `docs/context/environments.md` already flags these
as tracked-in-git-despite-being-gitignored and containing the pre-PR#40
vulnerable `match.ts`. Left alone at the time - out of that session's scope
and not safe to delete without confirming with Yanko first given they were
already flagged as a known item elsewhere.

## 7. `lib/useUser.ts` calls `auth.getSession()`, not `getUser()` — cross-referenced, not new

Already found and triaged in `apps/employee/AUDIT-2026-08-31.md` ("Open, not
fixed here"): `useUser.ts`'s initial identity load calls
`supabase.auth.getSession()` rather than `getUser()`, which CLAUDE.md's hard
constraints call out by name ("Auth gates use `getUser()`, never
`getSession()`"). That other audit's own conclusion still holds and this
pass re-confirms it rather than re-litigating it: **not a hole** -
`proxy.ts` has already gated the request server-side with `getUser()` before
any page renders, and every actual data operation goes through RLS
regardless of what this hook believes the client's role is, so this only
affects what buttons/labels render, never what a write is allowed to do. It
does carry the cross-portal refresh-token race CLAUDE.md documents elsewhere
(a `getSession()` on a possibly-stale session can redeem a refresh token
and invalidate another portal's) - `pages/api/match.ts` already guards
against exactly that race with `sessionFreshness()` before its own
`getUser()` call, and the same guard would close this one too, but that's a
change to shared client-identity code this app doesn't own alone (`useUser.ts`
is scheduler-specific, but the fix pattern and the race itself are
cross-portal). Logging the cross-reference here so this app's own checklist
doesn't look silent on something CLAUDE.md flags by name - not re-fixing it,
same call the other audit made.
