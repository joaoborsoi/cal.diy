## What does this PR do?

<!-- Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.

Note: Cal.diy is a community-maintained open-source project. Contributions here do NOT flow to Cal.com's production service. -->

Adds a "Choose for me" action to the public booking page for single-host event
types. Instead of browsing the calendar grid, the visitor can click the
button to have the app randomly pick one currently-loaded, bookable time
slot; this opens the same confirmation form a manual slot click would, with
that slot pre-selected, so the visitor still reviews and submits the booking
themselves. The visitor can re-roll ("Pick another time") as many times as
they like before confirming.

The random pick is drawn entirely from data already fetched client-side (no
new network calls), and it's routed through the exact same selection path a
manual slot click uses (`setSelectedDate` + the booker's
`onAvailableTimeSlotSelect`), so confirm-step, skip-confirm-step, seats, and
captcha behavior all stay consistent with the rest of the booking flow for
free. The button only renders for single-host event types — round-robin,
collective, and managed event types are out of scope for this change, since
slot availability there also depends on host assignment. Full design
rationale is in `docs/plans/choose-for-me.md`.

- Fixes #XXXX (GitHub issue number)

No new dependencies or environment variables are required.

## Visual Demo (For contributors especially)

A visual demonstration is strongly recommended, for both the original and new change **(video / image - any one)**.

#### Video Demo (if applicable):

<!-- Add a recording of clicking "Choose for me" on a single-host event type's booking page, showing the confirm form open pre-filled with a random slot, and a "Pick another time" re-roll. -->

#### Image Demo (if applicable):

<!-- Add a screenshot of the booking page showing the new button placed near the event title, above the calendar. -->

## Mandatory Tasks (DO NOT REMOVE)

- [x] I have self-reviewed the code (A decent size PR without self-review might be rejected).
- [x] I have updated the developer docs if this PR makes changes that would require a documentation change. N/A — this is a self-contained UI feature with no changes to public/developer-facing docs.
- [x] I confirm automated tests are in place that prove my fix is effective or that my feature works.

## How should this be tested?

<!-- Please describe the tests that you ran to verify your changes. Provide instructions so we can reproduce. Please also list any relevant details for your test configuration. Write details that help to start the tests -->

- No environment variables need to be set for this feature.
- **Minimal test data**: a single-host event type (not round-robin, collective,
  or managed) that has at least one open slot in the visible date range.
- **Happy path**: open that event type's public booking page → a "Choose for
  me" button appears near the event title, above the calendar → click it → the
  usual name/email confirmation form opens with a random available time
  already selected → click "Pick another time" to re-roll (repeatable, no
  limit) → fill in attendee details and confirm → the booking is created
  normally.
- **Seats edge case**: use an event type with `seatsPerTimeSlot` set and at
  least one slot already at capacity → confirm the random pick never lands on
  the full slot.
- **Round-robin/collective/managed event type**: confirm the button does not
  render at all.
- **Empty pool edge case**: on an event type where every currently loaded day
  is fully booked or marked away, click "Choose for me" → confirm it shows the
  inline "No available times loaded yet — browse the calendar to find one."
  message instead of doing nothing.
- Automated coverage: `apps/web/modules/bookings/lib/pickRandomSlot.test.ts`
  (pure slot-filtering/selection logic) and
  `apps/web/modules/bookings/components/ChooseForMeButton.test.tsx` (button
  behavior — selection, reroll label, empty-pool hint, round-robin gating);
  `Booker.test.tsx` updated with a mock for the new component so the existing
  suite keeps passing.

## Checklist

<!-- Remove bullet points below that don't apply to you -->

None of the items below apply to this PR.
