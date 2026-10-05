---
name: feature-implement
description: >-
  Step 3 (final) of the feature-development pipeline (feature-research →
  feature-plan → feature-implement). Implements an already-approved
  docs/plans/<slug>/plan.md — writes the code and tests, runs the repo's
  type-check/lint/build/test checks scoped to the affected packages, stops for
  the user's approval of the resulting change, and then drafts a PR description
  from .github/PULL_REQUEST_TEMPLATE.md into docs/plans/<slug>/pr.md. Use this
  when feature-plan hands off to you (invoked with a slug argument), or when the
  user directly says to start building / implementing a feature that already has
  an approved plan on disk. Do not use this to implement a feature that has no
  written, approved plan — send the user through feature-research and
  feature-plan first.
---

# Feature implement

This is the last of three chained skills, and it holds the pipeline's second
hard gate: the user reviews the actual change — code, tests, and check results —
before a PR description gets written. The plan produced upstream tells you
*what* to build; this skill is about building it faithfully and proving it
works, not about re-deciding scope.

## 1. Find the plan and confirm it's approved

If invoked with a slug argument, read `docs/plans/<slug>/plan.md`. If invoked
directly by the user without one, look for a matching `docs/plans/*/plan.md`.

If there's no plan on disk for what's being asked, or the plan looks like a
draft nobody signed off on, say so and route the user to `feature-research` /
`feature-plan` instead of guessing at scope yourself — implementing an
unapproved plan defeats the point of the gate that produced it.

## 2. Implement

- If the current branch is the default branch (`main`), create a feature branch
  first.
- Follow the plan's "Implementation steps" and other sections. Match the
  conventions of the surrounding code — imports, naming, error handling, file
  layout — rather than importing patterns from elsewhere. Read neighbouring
  files before adding to a package you haven't touched.
- Write tests as you go, per the plan's testing strategy:
  - Unit / integration: Vitest, in a `*.test.ts(x)` file next to the code under
    test. Cover the behavior the plan promises and its edge cases, not just the
    happy path.
  - End-to-end: Playwright under the relevant app's `playwright/` dir — only if
    the plan calls for it.
- Keep the change reviewable. This repo flags PRs over ~500 lines or ~10 files;
  if you're heading past that, pause and propose splitting the work.
- If you discover the plan was wrong or incomplete, stop and take it back to the
  user rather than silently diverging from it.

## 3. Verify

Run the repo checks, scoped to the package(s) you touched so this stays fast.
Prefer the workspace/filter forms over the repo-wide scripts:

| Check | Command (scope to what you changed) |
|---|---|
| Tests | `yarn vitest run <changed test paths>` |
| Type-check | `yarn turbo run type-check --filter=@calcom/<pkg>` |
| Lint | `yarn eslint <changed files>` (or `yarn lint` if broad) |
| Build | `yarn turbo run build --filter=@calcom/<pkg>` |

Report the outcome as a small table: check, command, pass/fail, and for
failures the relevant output. Fix anything you broke. If a check was genuinely
not applicable (e.g. no build target for the package), say so explicitly.

## 4. Approval gate — stop here

Present a change summary — files touched, what each change does, test coverage
added, check results — and ask the user to approve. **Do not write the PR
description until the user approves.**

## 5. Draft the PR description

Read `.github/PULL_REQUEST_TEMPLATE.md` and fill in every section for this
change. Write the result to `docs/plans/<slug>/pr.md`.

- Keep the "Mandatory Tasks (DO NOT REMOVE)" checkboxes; tick the ones this work
  actually satisfies and leave the rest for the user.
- Under "How should this be tested?", give real reproduction steps, required env
  vars, and the minimal test data — pulled from what you learned building it.
- Leave the visual demo section as placeholders for the user to fill with a
  screenshot or recording.
- If there's a tracking issue number, wire it into the "Fixes #XXXX" line;
  otherwise leave the placeholder.

Present the file path. This closes the pipeline — `docs/plans/<slug>/` now holds
`research.md`, `plan.md`, and `pr.md` for the whole feature.
