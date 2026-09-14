# Technical plan template

Copy this structure into `docs/plans/<kebab-case-feature-name>.md`. Keep every
heading. If a section doesn't apply, write `None` or `N/A — <reason>` instead of
removing it, so a reviewer can see it was considered.

---

# <Feature name>

## Summary

One paragraph: what the feature is, who it's for, and the user problem it solves.

## Goals

- Concrete, checkable outcomes this feature delivers.

## Non-goals

- Things a reader might assume are included but which are explicitly out of
  scope for this change.

## User stories & behavior

- As a `<role>`, I can `<action>` so that `<outcome>`.
- The main flow, step by step, including what the user sees at each step.
- Loading, empty, and error states.

## Affected areas

| Package / app | Change |
|---|---|
| `@calcom/...` | What changes here and why |

## Data model

Prisma schema changes, new tables/columns, indexes, migrations, and any backfill
of existing rows. `None` if there are no data model changes.

## API / server

New or changed tRPC procedures / REST endpoints. Input and output shapes.
Authorization checks. `None` if there are no server-side changes.

## UI

Components and pages added or changed, and their states. `None` if there is no UI.

## Gating & permissions

Feature flag, team/org permission, plan tier, or admin gate. How it rolls out
(off by default? gradual?). `None` if it ships on for everyone.

## i18n

New translation keys and their English default text. `None` if no new
user-facing strings.

## Edge cases & error handling

- Concurrency, permissions, deleted/archived parent records, timezone, large
  datasets, data that predates the feature — whichever apply.

## Testing strategy

- **Unit / integration (Vitest):** the specific cases to cover.
- **E2E (Playwright):** the flows to cover, or `Not needed because <reason>`.

## Rollout / migration considerations

Deploy ordering, migration safety, backward compatibility, anything that needs to
happen in a particular sequence. `None` if the change is self-contained.

## Open questions

- Anything still undecided that the user should weigh in on before implementation.

## Implementation steps

1. Ordered steps, each naming the files to create or change.
2. ...
