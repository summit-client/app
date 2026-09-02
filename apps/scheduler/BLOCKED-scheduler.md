# Blocked items — apps/scheduler hardening pass

Things that need a migration, a `packages/` change, or a new dependency,
which this session is not allowed to make. Each entry says what was done
instead, if anything.

## 1. Booking-integrity: no DB constraint against double-booking a clinician

**Migration written this session (`supabase/migrations/0045_sessions_no_double_booking.sql`) - NOT YET APPLIED.** This session's Supabase MCP access is
also read-only, same limit as the pass that wrote this item originally, so a
human still needs to run this migration against the live database before it
does anything. Implements exactly the two layers sketched below: the partial
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

Pre-existing, unrelated to this pass. `docs/context/environments.md`
already flags these as tracked-in-git-despite-being-gitignored and
containing the pre-PR#40 vulnerable `match.ts`. Left alone - out of this
session's scope and not safe to delete without confirming with Yanko first
given they're already flagged as a known items elsewhere.
