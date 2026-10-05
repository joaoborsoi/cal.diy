# Research document template

Copy this structure into `docs/plans/<slug>/research.md`. Keep every heading —
write `None` or `N/A — <reason>` instead of deleting a section that doesn't
apply, so `feature-plan` can see it was considered rather than missed.

---

# <Feature name> — Research

## Problem & user story

Who this is for, what they can't do today, what success looks like. One or two
`As a <role>, I can <action> so that <outcome>` stories.

## Goals

- Concrete, checkable outcomes this feature should deliver.

## Non-goals

- Things a reader might assume are included but are explicitly out of scope.

## Behavior & UX (draft)

The main flow, step by step, including what the user sees at each step, and the
loading/empty/error states. This is a draft for `feature-plan` to firm up, not
the final spec.

## Codebase findings

### Similar existing patterns

- `path/to/file.ts:120` — how a comparable feature does this today, and what to
  follow or deviate from.

### Affected areas

| Package / app | Why it's affected |
|---|---|
| `@calcom/...` | ... |

### Data model (current state)

Relevant Prisma models/fields today, and what would need to change.
`None` if this feature needs no data model changes.

### API surface (current state)

Relevant existing tRPC routers/procedures or REST endpoints, and where a new
one would live. `None` if this feature needs no new server-side surface.

### Gating conventions

How comparable features are flagged/permissioned in this codebase (file
references). `None` if this feature ships on for everyone.

### i18n conventions

Where translation keys for this area live today. `None` if there's no new
user-facing text.

## Edge cases & error handling

- Concurrency, permissions, deleted/archived parent records, timezone, large
  datasets, data that predates the feature — whichever apply.

## Open questions for the plan

- Anything still undecided that `feature-plan` (or the user) should resolve
  before implementation steps are written.
