---
name: feature-development
description: >-
  Guide the end-to-end development of a new feature in this repo: interview the
  user for the spec, write a technical plan to docs/plans/ that the user must
  approve, then implement the code with tests, run the repo checks
  (tests / type-check / lint / build), get a second approval, and finally draft a
  PR description from .github/PULL_REQUEST_TEMPLATE.md. Use this whenever the user
  asks to build, develop, add, implement, design, or spec out a new feature,
  capability, setting, endpoint, or piece of functionality — even when they jump
  straight to "can you build X" without asking for a plan. Do not start editing
  code for a non-trivial feature request without going through this skill first.
---

# Feature development

This skill exists because feature work goes wrong most often at the seams:
building the wrong thing because the spec was fuzzy, or landing a large
unreviewable change because scope drifted during implementation. The remedy is
two explicit approval gates with a written artifact at each one — a plan the user
signs off on before any code is touched, and a change summary the user signs off
on before the PR is written. Between and around those gates, the user stays in
control of scope.

Work through the phases in order. If the user invokes the skill when a plan
already exists in `docs/plans/`, read it and resume from the phase that matches
the current state instead of starting over.

---

## Phase 1 — Specification interview

Do not write code or a plan yet. The goal of this phase is to understand the
feature well enough that the plan you write next could be handed to another
engineer who would build the right thing.

Ask questions in small batches (3–5 at a time), starting with whatever is most
load-bearing for this particular request. Draw from:

- **Problem & user story** — who is this for, what can't they do today, what does
  success look like for them?
- **Scope** — what is explicitly in, and just as importantly what is out (the
  non-goals). Feature requests almost always contain an implied boundary; make it
  explicit.
- **Behavior & UX** — the concrete flows, step by step. Loading, empty, and error
  states. What the user sees when something goes wrong.
- **Affected areas** — which apps/packages this likely touches (`apps/web`,
  `packages/features`, `packages/trpc`, `packages/prisma`, `packages/ui`, …). If
  you're not sure, say so and plan to confirm by reading the code.
- **Data model** — new tables/columns, Prisma schema changes, migrations,
  backfills.
- **API surface** — new or changed tRPC procedures / REST endpoints, and their
  input/output shapes.
- **Gating** — feature flag, team/org permission, plan tier, admin-only?
- **i18n** — new user-facing strings mean new translation keys.
- **Edge cases** — concurrency, permissions, deleted/archived parents, timezone,
  large datasets, existing data that predates the feature.

Stop asking when you can describe the feature back in a few sentences and the
user confirms it's right. It's fine — good, even — to explore the codebase during
this phase to ground your questions in what's actually there.

---

## Phase 2 — Technical plan (approval gate 1)

Write the plan to `docs/plans/<kebab-case-feature-name>.md` using the structure
in `references/plan-template.md`. Read that file and follow its section order.
Every section should be filled in; write "None" or "N/A — because …" rather than
deleting a section, so a reviewer can see it was considered.

The plan should be specific enough to act on: name the files you expect to
create or change, the procedures you'll add, the schema diff, the test cases.
Vague plans defeat the purpose of the gate.

Then present a short summary in the chat (3–6 bullets) and the path to the file,
and ask the user to review and approve. **Do not modify any code until the user
explicitly approves.** If they ask for changes, edit the file, summarize what
changed, and ask again.

---

## Phase 3 — Implementation and tests

Once the plan is approved:

- If the current branch is the default branch (`main`), create a feature branch
  first.
- Implement the plan. Match the conventions of the surrounding code — imports,
  naming, error handling, file layout — rather than importing patterns from
  elsewhere. Read neighbouring files before adding to a package you haven't
  touched.
- Write tests as you go, per the plan's testing strategy:
  - Unit / integration: Vitest, in a `*.test.ts(x)` file next to the code under
    test. Cover the behavior the feature promises and the edge cases from the
    spec, not just the happy path.
  - End-to-end: Playwright under the relevant app's `playwright/` dir — only if
    the plan calls for it.
- Keep the change reviewable. This repo flags PRs over ~500 lines or ~10 files;
  if you're heading past that, pause and propose splitting the work.
- If you discover the plan was wrong or incomplete, stop and take it back to the
  user rather than silently diverging.

---

## Phase 4 — Verification (approval gate 2)

Run the repo checks, scoped to the package(s) you touched so this stays fast.
Prefer the workspace/filter forms over the repo-wide scripts:

| Check | Command (scope to what you changed) |
|---|---|
| Tests | `yarn vitest run <changed test paths>` |
| Type-check | `yarn turbo run type-check --filter=@calcom/<pkg>` |
| Lint | `yarn eslint <changed files>` (or `yarn lint` if broad) |
| Build | `yarn turbo run build --filter=@calcom/<pkg>` |

Report the outcome as a small table: check, command, pass/fail, and for failures
the relevant output. Fix anything you broke. If a check was genuinely not
applicable (e.g. no build target for the package), say so explicitly.

Then present a change summary — files touched, what each change does, test
coverage added, check results — and ask the user to approve. **Do not write the
PR description until the user approves.**

---

## Phase 5 — PR description

Read `.github/PULL_REQUEST_TEMPLATE.md` and fill in every section for this
change. Write the result to `docs/plans/<kebab-case-feature-name>-pr.md`.

- Keep the "Mandatory Tasks (DO NOT REMOVE)" checkboxes; tick the ones this work
  actually satisfies and leave the rest for the user.
- Under "How should this be tested?", give real reproduction steps, required env
  vars, and the minimal test data — pulled from what you learned building it.
- Leave the visual demo section as placeholders for the user to fill with a
  screenshot or recording.
- If there's a tracking issue number, wire it into the "Fixes #XXXX" line;
  otherwise leave the placeholder.

Present the file path and a one-line note that the plan and PR draft both live in
`docs/plans/`.
