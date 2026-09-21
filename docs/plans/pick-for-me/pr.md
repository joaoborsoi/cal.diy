## What does this PR do?

Adds a "Pick for me" ("Escolha por mim") action to the public booking page. A booker who doesn't have a strong time preference can click it to have one available slot chosen at random and pre-selected — exactly as if they'd clicked it manually — then confirm through the existing booking form. They can re-roll as many times as they like before confirming.

Motivation: today, even a booker who's fine with "any time that works" has to scan the calendar and manually pick a slot. This removes that friction for the common case where the exact time doesn't matter.

Highlights:
- Always available on every event type, no per-event-type opt-in.
- Searches forward month by month (capped at 12 months) for the first month with availability, rather than only randomizing within whatever's already loaded on screen. The server already clamps returned slots to the event type's own booking-window configuration, so no new server-side surface was needed for this.
- Re-rolling excludes the immediately-previous pick when there's more than one slot to choose from, so clicking again visibly changes something.
- Reuses the existing slot-selection state, booking form, and booking-creation mutation unchanged — this is additive, not a new booking path.
- Labels shipped in English and pt-BR.

Note: Cal.diy is a community-maintained open-source project. Contributions here do NOT flow to Cal.com's production service.

- Fixes #XXXX (GitHub issue number)

## Visual Demo (For contributors especially)

A visual demonstration is strongly recommended, for both the original and new change **(video / image - any one)**.

#### Video Demo (if applicable):

_TODO: add a short recording showing: opening a booking page, clicking "Pick for me", re-rolling once, then confirming the booking._

#### Image Demo (if applicable):

_TODO: add a screenshot of the booking page with the new "Pick for me" button visible next to the slot list._

## Mandatory Tasks (DO NOT REMOVE)

- [ ] I have self-reviewed the code (A decent size PR without self-review might be rejected).
- [x] I have updated the developer docs if this PR makes changes that would require a documentation change. N/A — no config, env var, or developer-facing API changes; the feature is purely additive UI + client-side logic.
- [x] I confirm automated tests are in place that prove my fix is effective or that my feature works.

## How should this be tested?

- No environment variables need to be set for this feature.
- Minimal test data: any user with an event type that has some availability in the next few months (e.g. the default seeded "30 min" event type works).
- Happy path:
  1. Go to that user's booking page (`/{username}/{event-slug}`).
  2. Click the "Pick for me" button next to the time-slot list.
  3. A slot gets selected (same highlighting as a manual click) and the booking form opens pre-filled with that time.
  4. Fill in name/email and confirm — you should land on the normal booking success page.
- Re-roll: click "Pick for me" again before confirming — you should get a different slot than last time (unless the event type genuinely has only one slot available).
- Empty state: for an event type with no availability at all within the next 12 months, the button should render disabled with a "No available times to pick from" tooltip instead of spinning. This specific state is covered by unit tests (`usePickRandomSlot.test.ts`) rather than e2e, since reliably forcing zero availability in the e2e environment would need fragile network mocking.
- pt-BR: switch the browser/account locale to Portuguese (Brazil) to see the button as "Escolha por mim".
- Automated coverage added in this PR:
  - `apps/web/modules/bookings/lib/pickRandomSlot.test.ts`
  - `apps/web/modules/bookings/lib/applyPickedSlot.test.ts` (includes a regression test for a month-change/selection-reset ordering bug found during implementation)
  - `apps/web/modules/bookings/hooks/usePickRandomSlot.test.ts`
  - `apps/web/playwright/booking-pages.e2e.ts` — new `"pick for me"` describe block covering the end-to-end booking flow

## Checklist

<!-- Remove bullet points below that don't apply to you -->

None of the items below apply to this PR — the contributing guide was followed, the code follows the project's style (`biome lint` passes clean), comments are limited to explaining non-obvious constraints (the month-search cap, the store's month-change/selection-reset ordering), and no new warnings were introduced.
