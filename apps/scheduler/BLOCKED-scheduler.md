# Blocked items — apps/scheduler hardening pass

Things that need a migration, a `packages/` change, or a new dependency,
which this session is not allowed to make. Each entry says what was done
instead, if anything.

## 1. Booking-integrity: no DB constraint against double-booking a clinician

**What's still open.** Nothing in the `sessions` table prevents two rows
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

**Accessibility finding, not fixed this session - marked with a comment at
the definition.** `TimeGrid.tsx`'s `DayColumn.handleColClick` derives the
target time from `e.clientY`, a continuous pixel Y position with no
discrete, focusable element per time slot. There is currently no way to
invoke click-to-create, or reach a specific time in the grid, from the
keyboard.

This is real, but narrower than "you can't book a session by keyboard":
the Create wizard (the `calendar` -> `matchCount` -> ... -> time-picker
steps in `pages/index.jsx`) is a fully keyboard-operable path to the same
outcome that doesn't touch the calendar grid at all, and it's the primary
path this app already steers most bookings through. What's missing is
specifically click-to-create's shortcut (click an empty slot, get a
pre-filled quick-create modal). Likewise, drag-to-reschedule uses native
HTML5 drag-and-drop (mouse-only by definition) but already has a full
keyboard-operable equivalent: `SessionDetail`'s "Reschedule" button opens
`RescheduleModal`, which is entirely `<select>`/button-driven.

Not fixed here because doing it properly means giving `TimeGrid` real
per-slot focusable targets (or some other keyboard path into the same
`onSlotClick`), which changes how the whole grid renders - a UI-visible
change to exactly the component CLAUDE.md's "Scheduler calendar v2"
history already flags as having caused a real, previously-undetected
regression once (`e.target !== e.currentTarget` silently killing
click-to-create entirely). This sandbox still has no Supabase credentials
to render the app and verify a grid change live, the same limitation noted
for that same component in this repo's own docs.

## 6. `apps/scheduler/dump.txt` and `index_dump.txt`

Pre-existing, unrelated to this pass. `docs/context/environments.md`
already flags these as tracked-in-git-despite-being-gitignored and
containing the pre-PR#40 vulnerable `match.ts`. Left alone - out of this
session's scope and not safe to delete without confirming with Yanko first
given they're already flagged as a known items elsewhere.
