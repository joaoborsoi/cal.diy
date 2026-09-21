# Pick for me ("Escolha por mim")

## Summary

Add a "Pick for me" action to the public booking page that randomly selects one
available slot for the current event type and feeds it into the existing
manual-selection flow, so a booker who doesn't care about the exact time can
confirm in one step instead of scanning the calendar. The picked slot is
pre-selected exactly as a manual click would be; the booker still confirms
through the existing booking form. No server, schema, or booking-creation
changes — this is a client-side addition that reuses existing data and mutations.

## Goals

- A visible, always-on "Pick for me" button on the booking page for every event
  type (no per-event-type opt-in).
- One click selects a random available slot from anywhere within the event
  type's real future-booking window (not just the currently-displayed month).
- Unlimited re-roll — clicking again picks a different slot.
- The picked slot plugs into the existing `selectedTimeslot` state and booking
  form unchanged.

## Non-goals

- No date-range picker for the booker to narrow the random pool.
- No per-event-type toggle to enable/disable the feature.
- No new confirmation modal — the existing booking form *is* the confirmation
  step.
- No change to how availability itself is computed (buffers, min-notice,
  booking limits) — only which already-available slot gets pre-selected.
- No change to the booking-creation mutation, its inputs, or its validation.

## User stories & behavior

- As a booker with no time preference, I can click "Pick for me" and see one
  available slot become selected, with the booking form open pre-filled with
  that time, so I can just fill my details and confirm.
- As that booker, if I don't like the suggested time, I can click "Pick for me"
  again (no limit) to get a different random slot, or ignore it and pick
  manually from the calendar instead.
- As a booker viewing an event type with no availability at all, I see the
  button disabled with an explanatory message instead of a spinner that never
  resolves.

**Flow:**

1. Booker opens the event type's public booking page; the normal calendar /
   `AvailableTimeSlots` list renders as today, with a new "Pick for me" button
   near `AvailableTimesHeader`.
2. On click: the button enters a loading state and the app searches forward,
   month by month starting from the current month, for the first month that has
   at least one available slot (see "Random pool" below for the search bound).
3. Once a populated month is found, one slot from that month is chosen at
   random and set as the selection via the *same* path a manual click uses
   (`onAvailableTimeSlotSelect` → `setSelectedTimeslot`), including navigating
   the displayed calendar to that slot's month if it differs from the month
   currently shown.
4. The existing booking form opens pre-filled with that time, unchanged from
   today's manual-selection behavior.
5. Booker can re-click "Pick for me" for a new random slot (excluding the
   immediately-previous pick when the known pool has more than one option, so a
   re-roll visibly changes something), or proceed to fill in the form and
   confirm — the existing `createBooking` mutation fires unchanged.
6. If no slot exists anywhere within the search bound, the button is disabled
   with a tooltip/message (e.g. "No available times to pick from") instead of
   spinning indefinitely.

### Random pool: search bound

`trpc.viewer.slots.getSchedule` is month-scoped
(`packages/features/schedules/hooks/useTimesForSchedule.ts`) — there's no
single call that returns "all" availability. Walking forward indefinitely for
an `UNLIMITED`-period event type would be unbounded, so the walk is capped by
the event type's own future-booking window where one exists:

- `periodType: ROLLING` / `ROLLING_WINDOW` → cap the walk at `periodDays` (or
  the equivalent count-based window) from today.
- `periodType: RANGE` → cap the walk at the range's end date.
- `periodType: UNLIMITED` (or if the period fields aren't available on the
  client at this point) → fall back to a fixed 12-month walk as a safety bound,
  so the button can't trigger unbounded requests.

Stop walking as soon as a month with ≥1 available slot is found — the random
pool is that month's slots, not every future month's. This keeps the button
fast in the common case (an event type with near-term availability resolves in
one request) while still respecting "search the real availability window," not
an arbitrary short window, for sparser event types.

## Affected areas

| Package / app | Change |
|---|---|
| `apps/web/modules/bookings/components/Booker.tsx` | Render the new "Pick for me" button; wire its click handler to the new hook and to the existing `onAvailableTimeSlotSelect`. |
| `apps/web/modules/bookings/hooks/usePickRandomSlot.ts` (new) | Orchestrates the month-walk search, random selection, and re-roll-excluding-previous logic. Pure selection logic factored into a small testable helper (see below). |
| `apps/web/modules/bookings/lib/pickRandomSlot.ts` (new) | Pure, framework-free helper: given a list of slot strings and an optional slot to exclude, return a randomly chosen slot (or `null` for an empty pool). Kept separate from the hook so it's trivially unit-testable. |
| `packages/features/bookings/Booker/store.ts` | No change to the store's shape — reuse `setSelectedTimeslot` / `month` setters as they exist today. Confirm call-order (see Edge cases) rather than modify. |
| `packages/lib/telemetry.ts` | Add one new `telemetryEventTypes` entry, e.g. `slotRandomlyPicked: "slot_randomly_picked"`, following the existing flat-string pattern (line 8). |
| `packages/i18n/locales/en/common.json` | New keys: `pick_for_me`, `pick_for_me_no_slots` (see i18n below). |
| `packages/ui/components/icon` | No change — `shuffle` icon already exists (`icon-names.ts:130`) and can be used directly. |

## Data model

None. No schema or migration changes — this feature only reads existing
availability data and writes through the existing booking-creation path.

## API / server

None. No new tRPC procedure. The month-walk is client-side orchestration that
calls the existing `trpc.viewer.slots.getSchedule` query imperatively (via the
trpc vanilla/query client, the same way `useSchedule` already calls it) once
per month it needs to check, rather than adding a new server endpoint that
would duplicate that logic.

## UI

- **Button**: placed next to `AvailableTimesHeader`, alongside where
  `AvailableTimeSlots` is rendered in `Booker.tsx` (~line 512 and ~603, mobile
  and desktop layouts). Uses the `shuffle` icon + `pick_for_me` label.
- **Loading state**: while the month-walk is in flight, the button shows a
  spinner and is disabled (prevents double-invocation / request pile-up on fast
  re-clicks).
- **Disabled/empty state**: if the search bound is exhausted with zero slots
  found, the button is disabled with a tooltip using `pick_for_me_no_slots`.
- **Selection feedback**: once a slot is picked, rely on the existing
  selected-slot highlighting / booking-form-open behavior — no new "confirm
  this slot?" UI is introduced (per Non-goals).

## Gating & permissions

None. Always on for every event type, per the approved research — no feature
flag, no event-type setting, no permission check.

## i18n

New keys in `packages/i18n/locales/en/common.json`, following the file's
existing flat snake_case convention (e.g. `"confirm": "Confirm"` at line 872):

- `"pick_for_me": "Pick for me"`
- `"pick_for_me_no_slots": "No available times to pick from"`

Also add the same two keys, translated, to
`packages/i18n/locales/pt-BR/common.json` (confirmed to exist, e.g.
`"confirm": "Confirmar"` at line 867), so the feature isn't English-only for
existing pt-BR users:

- `"pick_for_me": "Escolha por mim"`
- `"pick_for_me_no_slots": "Nenhum horário disponível para sortear"`

## Edge cases & error handling

- **Month-change resets selection**: `store.ts` sets `selectedTimeslot: null`
  as part of changing `month` (line ~531). If the random pick lands in a month
  different from the one currently displayed, the implementation must update
  `month` *first* and call `setSelectedTimeslot(pickedSlot)` *after*, not
  simultaneously/before — otherwise the month change silently clobbers the
  pick. This needs a regression test (see Testing strategy).
- **Zero slots anywhere within the search bound**: disable the button with the
  empty-state message rather than spinning or silently doing nothing.
- **`getSchedule` request fails mid-walk**: surface the existing
  error-handling/toast pattern used elsewhere for this query rather than
  leaving the button stuck in a loading state; stop the walk on error.
- **Sparse availability near the search bound**: the walk has a hard cap (see
  Random pool) so it can't hang or fire unbounded requests searching for a slot
  that doesn't exist.
- **Rapid re-click / re-roll spam**: disable the button while a fetch triggered
  by the walk is in flight; re-rolling within an already-fetched month's pool
  (no new fetch needed) is fine to allow immediately.
- **Pool of exactly one slot**: re-roll has nothing else to exclude-and-pick;
  either keep returning that slot or visually no-op — acceptable, don't treat
  as an error.
- **Multi-timezone / DST**: no special handling — `getSchedule` already returns
  slots in the booker's timezone, and random pick only chooses among values it
  returns.

## Testing strategy

- **Unit (Vitest):**
  - `pickRandomSlot.ts`: empty pool → `null`; single-item pool → that item;
    pool with an `exclude` value and ≥2 items → never returns the excluded
    value; pool with an `exclude` value and exactly 1 item → returns that item
    (nothing else to pick).
  - `usePickRandomSlot` orchestration (mock the trpc client): walking stops at
    the first month with ≥1 slot and does not issue requests for further
    months; respects the `ROLLING`/`RANGE`/`UNLIMITED` cap boundaries described
    above; surfaces a "no slots found" result once the cap is reached with zero
    availability.
  - Regression test for the month-change/selection-clobber ordering bug
    described in Edge cases: asserts that after a random pick lands in a
    different month than currently displayed, the final store state has both
    the correct `month` *and* the correct `selectedTimeslot` (not `null`).
- **E2E (Playwright):** add a case to the existing booking-flow suite:
  - Seeded event type with near-term availability: click "Pick for me", assert
    a slot becomes selected and the booking form opens pre-filled with a valid
    time; fill required fields and submit; assert the booking is created
    (reuse existing booking e2e helpers/fixtures).
  - Seeded event type with no availability: assert the button renders disabled
    with the empty-state message.

## Rollout / migration considerations

None. Purely additive client-side feature with no schema or API change — no
migration ordering, no backward-compatibility concern, can ship in one PR.

## Open questions

None blocking implementation. The month-walk-vs-prefetch question from
research is resolved above (capped month-by-month walk, stop at first
populated month). Exact button copy/icon are proposed above as reasonable
defaults; the user can adjust wording during review if desired.

## Implementation steps

1. Add `packages/i18n/locales/en/common.json` keys: `pick_for_me`,
   `pick_for_me_no_slots`. Add the same keys, translated, to
   `packages/i18n/locales/pt-BR/common.json`.
2. Add `telemetryEventTypes.slotRandomlyPicked` to `packages/lib/telemetry.ts`.
3. Create `apps/web/modules/bookings/lib/pickRandomSlot.ts` — pure function
   `pickRandomSlot(pool: string[], exclude?: string | null): string | null`.
4. Write unit tests for `pickRandomSlot.ts` (`pickRandomSlot.test.ts`, same
   directory) covering the cases listed in Testing strategy.
5. Create `apps/web/modules/bookings/hooks/usePickRandomSlot.ts`:
   - Reads the event type's `periodType`/`periodDays`/range (confirm the exact
     client-accessible field names/shape on the event-type object already
     available in `Booker.tsx` context before wiring this up) to compute the
     walk's month cap, falling back to 12 months when unbounded or unavailable.
   - Walks forward month by month using the existing trpc client to call
     `viewer.slots.getSchedule` imperatively (same input shape `useSchedule`
     already builds), starting from the currently-relevant month, stopping at
     the first month with ≥1 slot or the cap.
   - Exposes `pickRandomSlot()` (returns the chosen slot string or `null`) and
     `isLoading`/`hasNoSlots` state for the button to render.
   - Tracks the previously-picked slot internally so re-roll can pass it as
     `exclude` to the pure helper.
6. Write unit tests for `usePickRandomSlot.ts` (mocking the trpc client) per
   Testing strategy, including the month-change/selection-clobber regression
   test — this may require light test-only helpers around the Zustand store,
   or exercising the ordering directly if the hook owns the store calls.
7. Wire the button into `Booker.tsx`: render near `AvailableTimesHeader` in
   both the desktop (~line 512) and mobile (~line 603) layouts, using the
   `shuffle` icon and `pick_for_me` label; on click, call
   `usePickRandomSlot().pickRandomSlot()`, then update `month` (if the picked
   slot's month differs from the displayed one) *before* calling
   `onAvailableTimeSlotSelect(pickedSlot)` — preserving the order described in
   Edge cases. Disable the button and show the empty-state tooltip when
   `hasNoSlots` is true; show a spinner while `isLoading`.
8. Dispatch the `slotRandomlyPicked` telemetry event at the point the button
   click resolves to a picked slot (confirm the project's existing
   `telemetry.event(...)` call signature from a nearby usage before wiring
   this in, since no call site currently exists inside `Booker.tsx` itself).
9. Add the Playwright e2e cases described in Testing strategy to the existing
   booking-flow spec file(s).
10. Run the scoped checks (Vitest for the new files, `type-check` and `build`
    filtered to `@calcom/web`, `lint` on changed files) before requesting
    review.
