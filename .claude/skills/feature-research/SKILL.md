---
name: feature-research
description: >-
  Step 1 of the feature-development pipeline (feature-research → feature-plan →
  feature-implement). Interviews the user to pin down what a new feature should
  do and explores the codebase to ground that spec in what actually exists —
  similar patterns, affected packages, relevant schema and API surface — then
  writes docs/plans/<slug>/research.md and hands off to feature-plan. Use this
  whenever the user asks to build, develop, add, implement, design, or spec out
  a new feature, capability, setting, endpoint, or piece of functionality — even
  when they jump straight to "can you build X". Do not start editing code or
  writing a plan for a non-trivial feature request without going through this
  skill first; it is the entry point of the pipeline.
---

# Feature research

This is the first of three chained skills. Feature work goes wrong most often at
the seams — building the wrong thing because the spec was fuzzy, or writing a
plan that ignores how the codebase already does similar things. This skill's job
is to remove both failure modes *before* a plan gets written: nail down the
requirements with the user, and ground them in what the code actually looks
like.

The next skill, `feature-plan`, trusts what's in `research.md` and doesn't
re-derive it — so be concrete here rather than deferring detail downstream.

## 1. Name the feature and create its folder

Pick a short kebab-case slug (e.g. `custom-thank-you-message`) and create
`docs/plans/<slug>/`. This slug is the handoff key between all three skills —
keep it stable.

If `docs/plans/<slug>/` already exists with a `research.md`, you're likely
resuming or refining earlier research rather than starting fresh — read it
first and update it in place instead of overwriting blindly.

## 2. Interview the user

Ask in small batches (3–5 at a time), leading with whatever is most
load-bearing for this particular request:

- **Problem & user story** — who is this for, what can't they do today, what
  does success look like for them?
- **Scope** — what's explicitly in, and just as important, what's out. Feature
  requests almost always contain an implied boundary; make it explicit.
- **Behavior & UX** — concrete flows step by step, including loading/empty/error
  states.
- **Data model** — new tables/columns, migrations, backfills of existing data.
- **API surface** — new or changed tRPC procedures / REST endpoints.
- **Gating** — feature flag, team/org permission, plan tier, admin-only?
- **i18n** — new user-facing strings need new translation keys.
- **Edge cases** — concurrency, permissions, deleted/archived parents, timezone,
  large datasets, existing data predating the feature.

Stop asking when you can describe the feature back in a few sentences and the
user confirms it's right.

## 3. Ground it in the codebase

While or after interviewing, explore the repo for what's actually there — don't
let the plan phase discover this later:

- Search for existing features that are structurally similar (a comparable
  per-event-type or per-user setting, a comparable export flow, etc.) and note
  the pattern they follow.
- Identify which apps/packages are actually affected (`apps/web`,
  `packages/features`, `packages/trpc`, `packages/prisma`, `packages/ui`, …) —
  confirm with a real search rather than guessing from the feature description.
- Note the relevant Prisma models/fields, and the tRPC routers that would host
  new procedures.
- Note existing conventions for gating (flags, permission checks) and i18n
  (where keys live) that this feature should follow.

Record file paths and short excerpts, not just package names — `feature-plan`
should be able to write concrete implementation steps from this without
re-searching from scratch.

## 4. Write research.md

Write `docs/plans/<slug>/research.md` following `references/research-template.md`.
Fill every section; use "None" or "N/A — because …" rather than deleting a
section that doesn't apply, so the plan author can see it was considered.

## 5. Hand off to feature-plan

Present a short summary (3–6 bullets) of what you learned and confirm it matches
what the user meant — this is cheap to fix now and expensive to fix after a plan
is written. Once confirmed, continue the pipeline yourself by invoking the
`feature-plan` skill with the slug as its argument, e.g.:

```
Skill(skill: "feature-plan", args: "<slug>")
```

Tell the user you're moving on to the planning step.
