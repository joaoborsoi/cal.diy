# Choose for me ("Escolha por mim")

## Summary

Add a "Choose for me" action to the public booking page for single-host event
types. Instead of browsing the calendar grid, the visitor clicks the button,
the app randomly picks one currently-loaded available time slot, and the
normal booking-confirmation form opens pre-filled with that slot — the visitor
still reviews and submits the booking themselves. The visitor can re-roll as
many times as they like before confirming.

## Goals

- A visible "Choose for me" button on the booking page for single-host
  (non round-robin/collective/managed) event types, always on — no feature
  flag or per-event-type opt-in for v1.
- Clicking it randomly selects one bookable slot from what's already loaded
  client-side (no extra network round trip) and drives the booker into the
  same confirmation step a manual slot click would.
- The visitor can re-roll before confirming, with no cap on attempts.
- If nothing is loaded/bookable yet, the visitor gets a clear inline message
  instead of a silent no-op.

## Non-goals

- Round-robin, collective, or managed event types (host selection interacts
  with slot availability there — out of scope for v1).
- Expanding the search beyond what the booker has already fetched (no new
  `getSchedule` calls triggered by this feature).
- Auto-submitting the booking without the visitor reviewing/confirming.
- A feature flag or organizer-facing setting to disable it — can be added
  later if requested; v1 ships on for everyone.
- Any change to the `getSchedule` procedure, the Prisma schema, or the booking
  submission API.

## User stories & behavior

- As a visitor on an event type's booking page, I can click "Choose for me"
  instead of scanning the calendar, and land directly on the same
  name/email confirmation form I'd see after manually picking a time, with a
  random valid time already selected.
- As that visitor, if I don't like the picked time, I can click "Pick another
  time" (same button, relabeled) to re-roll before I submit — as many times as
  I want.
- As that visitor, if the booker hasn't loaded any bookable slots yet (e.g.
  page just opened, or every loaded day is fully booked/away), clicking the
  button shows a small inline message telling me to browse forward on the
  calendar instead, rather than doing nothing.
- As an organizer of a round-robin/collective/managed event type, I don't see
  this button at all — behavior is unchanged for those event types.

## Affected areas

| Package / app | Change |
|---|---|
| `apps/web/modules/bookings/components` | New `ChooseForMeButton.tsx`; edit `Booker.tsx` to render it; new `__mocks__/ChooseForMeButton.tsx` for existing `Booker.test.tsx` |
| `apps/web/modules/bookings/lib` | New `pickRandomSlot.ts` pure helper + test |
| `packages/i18n/locales/en/common.json`, `packages/i18n/locales/pt-BR/common.json` | New translation keys |

## Data model

None — no schema or migration changes.

## API / server

None — reuses the existing `viewer.slots.getSchedule` data already fetched by
the booker (`schedule.data.slots`) and the existing `/api/book/event` booking
submission path. No new procedures or endpoints.

## UI

- **`ChooseForMeButton`** (new): rendered in `Booker.tsx`, inside the `meta`
  `BookerSection`, immediately after the `EventMeta` block and before the
  `DatePicker`(around `apps/web/modules/bookings/components/Booker.tsx:429`),
  under the same `!hideEventTypeDetails` guard EventMeta uses, and only when
  `!event.data?.schedulingType` (i.e. not `ROUND_ROBIN` / `COLLECTIVE` /
  `MANAGED` — see `packages/prisma/schema.prisma`'s `SchedulingType` enum).
  This section is not hidden across `bookerState` transitions, so the same
  button instance can relabel itself instead of needing a second location for
  "re-roll."
- States:
  - Default label: "Choose for me" (dice/shuffle icon).
  - After a random pick is active (and the visitor hasn't submitted the
    booking yet): relabels to "Pick another time," re-rolling on each click.
  - Resets back to the default label if the visitor clears the selection
    (`selectedTimeslot` becomes `null`, e.g. they cancel the confirm step) or
    the booking completes.
  - Empty-pool click: shows an inline hint text below the button (not a
    blocking dialog) — "No available times loaded yet — browse the calendar
    to find one."
- No changes to `AvailableTimeSlots.tsx` / `AvailableTimes.tsx` rendering —
  the button drives the same store state those components already react to.

## Gating & permissions

None beyond the `schedulingType` check above — ships on for everyone, no
`isVisitorWithinPercentage` rollout and no DB-backed feature flag for v1. If a
kill switch is wanted later, `isVisitorWithinPercentage`
(`packages/features/bookings/Booker/utils/isFeatureEnabledForVisitor.ts`) is
the established pattern for this page and can be layered in without changing
the component's public surface.

## i18n

Add to `packages/i18n/locales/en/common.json` (and mirrored Portuguese text in
`packages/i18n/locales/pt-BR/common.json`):

- `choose_for_me`: "Choose for me" / "Escolha por mim"
- `choose_for_me_pick_another`: "Pick another time" / "Sortear outro horário"
- `choose_for_me_no_slots_loaded`: "No available times loaded yet — browse the
  calendar to find one." / "Nenhum horário disponível carregado ainda — navegue
  pelo calendário para encontrar um."

## Edge cases & error handling

- **Empty pool**: no non-`away`, bookable slots currently in
  `schedule.data.slots` → show the inline hint above; do not disable the
  button (new slots may load as the visitor navigates the calendar, and the
  button should re-evaluate the pool on every click rather than caching
  staleness).
- **Seats-per-timeslot events**: single-host event types can still have
  `seatsPerTimeSlot` set. The random pick must only consider slots that are
  still bookable (not at capacity) — reuse whatever check `AvailableTimes.tsx`
  already applies to enable/disable a slot for manual clicks, rather than
  re-deriving capacity logic. Verify the exact field (`attendees` count vs.
  `seatsPerTimeSlot`) against the `Slot` type
  (`apps/web/modules/schedules/lib/types.ts`) while implementing.
- **`unavailableTimeSlots`** (from the quick-availability-check feature): must
  be excluded from the random pool the same way `AvailableTimeSlots.tsx`
  excludes them from being clickable.
- **`skipConfirmStep` events**: if the event/layout is configured to skip the
  confirm step, a manual slot click books immediately without showing the
  form. "Choose for me" must behave identically for consistency — it calls the
  same `onAvailableTimeSlotSelect` path a manual click uses, so this falls out
  for free rather than needing special-casing. Confirm this during
  implementation by tracing `Booker.tsx`'s `useEffect` at line ~221 that
  derives `bookerState` from `selectedDate`/`selectedTimeslot`/`skipConfirmStep`.
- **Month navigation**: the randomly chosen slot may be on a date other than
  the one currently selected in the calendar. Call `setSelectedDate` before
  `onAvailableTimeSlotSelect` so the date picker and slot list stay visually
  consistent with the selection.
- **Reroll spam**: no rate limiting — this is a client-side, no-network-call
  action, so there's no backend cost to guard against.

## Testing strategy

- **Unit (Vitest):**
  - `pickRandomSlot.ts`: given a `schedule.data.slots`-shaped map, an
    `unavailableTimeSlots` list, and an injectable `random` function (default
    `Math.random`, overridable in tests for determinism), returns the
    expected `{date, time}` — covers: normal pool, `away` slots excluded,
    `unavailableTimeSlots` excluded, seats-at-capacity excluded, empty pool
    returns `null`.
  - `ChooseForMeButton.test.tsx`: renders with a mocked schedule, clicking
    calls `setSelectedDate` and `onAvailableTimeSlotSelect` with a slot from
    the pool; renders the empty-pool hint when the pool is empty; relabels to
    "Pick another time" once a timeslot is selected; does not render when
    `event.schedulingType` is `ROUND_ROBIN`/`COLLECTIVE`/`MANAGED`.
  - Update `Booker.test.tsx`'s existing mock list to include a
    `__mocks__/ChooseForMeButton.tsx` mock, matching the pattern already used
    for `AvailableTimeSlots`/`DatePicker`/`EventMeta` there, so this addition
    doesn't break that suite.
- **E2E (Playwright):** Not needed for v1 — the interaction is a thin client
  wrapper around an already-covered booking flow; a full booking-completion
  E2E for this button would mostly duplicate existing booking Playwright
  coverage. Revisit if the follow-up expands scope (e.g. round-robin support).

## Rollout / migration considerations

None — no data migration, no deploy ordering constraints, purely additive UI.

## Open questions

- Exact field name/shape for seats-remaining on a `Slot` (see Edge cases) —
  to be confirmed against `apps/web/modules/schedules/lib/types.ts` and
  `AvailableTimes.tsx` during implementation rather than blocking the plan.
- Whether the button should also render when `layout === BookerLayouts.WEEK_VIEW`
  (which uses `LargeCalendar` instead of the month `DatePicker`) — current plan
  places it in the shared `meta` section so it renders regardless of layout;
  flagging in case that turns out visually cramped in week view once built.

## Implementation steps

1. Add `pickRandomSlot.ts` in `apps/web/modules/bookings/lib/` — pure function
   `pickRandomSlot(slots, { unavailableTimeSlots, seatsPerTimeSlot, random })
   => { date, time } | null`. Add `pickRandomSlot.test.ts` alongside it.
2. Add `ChooseForMeButton.tsx` in `apps/web/modules/bookings/components/` —
   takes `schedule`, `event`, `unavailableTimeSlots`, `selectedTimeslot`,
   `setSelectedDate`, `onAvailableTimeSlotSelect` as props; uses
   `pickRandomSlot` on click; manages its own "has an active random pick"
   local state for the relabel; renders the empty-pool hint. Add
   `ChooseForMeButton.test.tsx`.
3. Wire it into `Booker.tsx`: import, gate on
   `!hideEventTypeDetails && !event.data?.schedulingType`, render after
   `EventMeta`, passing the store values/handlers already destructured in that
   file (`setSelectedDate`, `onAvailableTimeSlotSelect`, `selectedTimeslot`,
   `schedule`, `unavailableTimeSlots`, `event`).
4. Add `apps/web/modules/bookings/components/__mocks__/ChooseForMeButton.tsx`
   and register it in `Booker.test.tsx`'s mock imports.
5. Add the three i18n keys to `packages/i18n/locales/en/common.json` and
   `packages/i18n/locales/pt-BR/common.json`.
6. Run scoped checks per Phase 4 of the skill (vitest, type-check, lint,
   build) for the affected packages before requesting the second approval.
