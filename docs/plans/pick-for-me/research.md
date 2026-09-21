# Pick for me ("Escolha por mim") — Research

## Problem & user story

Some bookers don't have a strong preference for *when* a meeting happens — they
just want it scheduled with minimal friction. Today they must scan the calendar
grid and manually pick a slot even when any available time works for them.

- As a booker who doesn't care which slot, I can click "Pick for me" and get a
  single available slot pre-selected for me, so that I can confirm in one step
  instead of scanning the calendar.
- As that same booker, if the picked slot doesn't actually work for me once I
  see it, I can re-roll as many times as I want, or ignore the suggestion and
  pick manually instead.

## Goals

- A "Pick for me" action on the public booking page that selects one random
  available slot, for any event type, with no per-event-type opt-in required.
- The picked slot flows into the existing manual-selection state and booking
  form unchanged — the booker still confirms name/email/etc. through the normal
  form before the booking is created.
- Unlimited re-roll: clicking the action again picks a new random slot.

## Non-goals

- No date-range picker or "randomize within this week/month" control — the
  random pool is the event type's normal full availability window, not a
  user-chosen subset (per interview answer).
- No per-event-type toggle to disable/enable the feature — it's always
  available (per interview answer). A future iteration could add gating; out of
  scope here.
- No new confirmation modal — reuses the existing booking form as the
  confirmation step, not a lightweight "Book at HH:mm?" dialog.
- No change to slot availability computation itself (buffers, min-notice,
  booking limits) — random pick only chooses among slots the existing system
  already reports as available.

## Behavior & UX (draft)

1. Booker opens the event type's public booking page and sees the normal
   calendar/slot list (`AvailableTimeSlots`), plus a new "Pick for me" button.
2. Booker clicks "Pick for me". The system picks one random slot from the
   currently-known available slots and selects it exactly as a manual click
   would (same state, same `?slot=` URL param).
3. The UI scrolls/highlights to the picked slot and opens the existing booking
   form pre-filled with that time, same as manual selection.
4. Booker can click "Pick for me" again to get a different random slot (no
   limit), or ignore it and pick manually from the list instead.
5. Booker fills in the normal form fields and confirms — booking creation is
   the existing, unchanged mutation.
6. Loading state: while a wider pool of months is being fetched to pick from
   (see Data model / API note below), the button should show a brief loading
   state rather than picking from a near-empty first-month result.
7. Empty state: if the event type has no available slots at all (rare, but
   possible for fully-booked or misconfigured event types), disable the button
   or show "No available times to pick from" rather than silently doing
   nothing.

## Codebase findings

### Similar existing patterns

None found. A search of `packages/features/bookings` and
`apps/web/modules/bookings` turned up no randomization utility or "next
available slot" style feature — this is a new interaction pattern for the
booker UI, not an extension of an existing one.

### Affected areas

| Package / app | Why it's affected |
|---|---|
| `apps/web/modules/bookings/components/Booker.tsx` | Owns `onAvailableTimeSlotSelect` / `setSelectedTimeslot`; the new button lives here, next to where `AvailableTimeSlots` is rendered (~line 512, ~603). |
| `apps/web/modules/bookings/components/AvailableTimeSlots.tsx` | Reference for how a slot click currently flows into selection (~line 137) — not necessarily changed, but is the pattern to match. |
| `packages/features/bookings/Booker/store.ts` | Holds `selectedTimeslot` state (line 367, 677–686) that the random pick needs to set via `setSelectedTimeslot`. |
| `packages/features/schedules/hooks/useTimesForSchedule.ts` | Computes the `startTime`/`endTime` window passed to the slots query; currently month-scoped, which is the key open question below. |
| `apps/web/modules/schedules/hooks/useSchedule.ts` | Wraps `trpc.viewer.slots.getSchedule` (line 150) — the data source the random pick draws from. |
| `packages/lib/telemetry.ts` | Where a new `telemetryEventTypes` entry (e.g. for "picked a random slot") would be added, following the existing `bookingConfirmed`-style pattern (line 8). |
| `packages/i18n/locales/en/common.json` | Where new button/label strings go (e.g. near `"confirm": "Confirm"` at line 872). |

### Data model (current state)

None. This feature reads existing slot-availability data and writes to the
existing booking-creation path; no new persisted state, no schema/migration.

### API surface (current state)

No new procedure is required to *create* the booking — `useHandleBookEvent` /
`createBooking` (`packages/features/bookings/lib/create-booking`, wired in
`apps/web/modules/bookings/hooks/useBookings.ts:136-137`) is reused unchanged.

The open question is the **read** side: `trpc.viewer.slots.getSchedule` takes
an explicit `startTime`/`endTime` window
(`packages/trpc/server/routers/viewer/slots/types.ts:7-40`), and
`useTimesForSchedule.ts` currently computes that window as the **current
calendar month** (with optional next-month prefetch) — it does not fetch the
event type's entire future availability in a single call. "Sortear em toda a
disponibilidade" (random pick across the full availability window, per the
interview) therefore needs one of:

- (a) Walk forward month-by-month, calling `getSchedule` for each month until a
  month with available slots is found (and optionally keep walking further, up
  to some cap, to build a larger random pool), or
- (b) Constrain the random pool to whatever's already loaded/prefetched at
  click time (cheaper, but "random" would really mean "random within the next
  ~1-2 months", not the full window).

This is a real design decision — `feature-plan` should pick one explicitly
rather than leaving it implicit, since it affects both perceived randomness and
the number of API calls the button can trigger.

### Gating conventions

N/A — per the interview, this feature has no event-type-level toggle and is
always available, so there's no existing gating pattern to follow here.

### i18n conventions

Confirmed: strings live in `packages/i18n/locales/en/common.json` (not under
`apps/web/public/...`, which doesn't exist in this repo). Example existing
entries: `"booking_confirmation": "Confirm your {{eventTypeTitle}} with
{{profileName}}"` (line 770), `"confirm": "Confirm"` (line 872). New keys for
this feature (e.g. `pick_for_me`, `pick_for_me_no_slots`) should follow the
same flat, snake_case naming already used in that file.

## Edge cases & error handling

- **Event type with zero available slots** — button should be disabled or show
  an explicit empty message, not fail silently or spin forever.
- **Slot becomes unavailable between pick and confirm** — this is already a
  race the existing manual-pick flow handles at booking-creation time (the
  mutation rejects a no-longer-available slot); random pick doesn't need new
  handling here, just shouldn't regress the existing error surfacing.
- **Very sparse availability** (e.g. only 1-2 slots total, far in the future) —
  month-by-month walking (if that's the chosen approach) needs a sane cap so
  the button doesn't spin for a long time or issue unbounded requests searching
  for a slot that doesn't exist.
- **Repeated re-roll spamming the slots API** — if re-roll always triggers a
  fresh `getSchedule` walk, rapid clicking could fire many requests; worth
  either debouncing or capping how often a fresh fetch happens vs. re-picking
  from an already-fetched pool.
- **Multi-timezone bookers** — no special handling beyond what `getSchedule`
  already does (it's timezone-aware); random pick just needs to select from
  slots already expressed in the booker's timezone.

## Open questions for the plan

1. Which approach for "random across full availability" — month-by-month walk
   with a cap (2a), or random-within-prefetched-window (2b)? This changes both
   UX (possible brief loading state) and API call volume.
2. Should re-roll always fetch fresh data, or pick again from the already-known
   pool until it's exhausted, then fetch more?
3. Exact button placement/copy in `Booker.tsx` relative to `AvailableTimeSlots`
   and `AvailableTimesHeader` — needs a concrete implementation step, not just
   "near it".
4. Whether to add the `telemetryEventTypes` entry now (e.g. `slotRandomlyPicked`)
   — no existing call site was found inside `Booker.tsx` itself, so the plan
   should confirm the right place to dispatch it if this is included.
