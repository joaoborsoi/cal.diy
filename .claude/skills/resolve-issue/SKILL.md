---
name: resolve-issue
description: >-
  Headless, non-interactive coding agent that resolves one GitHub issue end to
  end: reads the issue from a run directory prepared by
  scripts/agent-issue.sh, researches the codebase, writes a plan, implements the
  fix with tests, runs scoped checks, commits on the current branch, and writes
  a summary and PR draft back into the run directory. Ends with a structured
  completed/failed verdict. Only meant to be run through
  `scripts/agent-issue.sh` (claude -p); for interactive feature work use
  feature-research → feature-plan → feature-implement instead.
disable-model-invocation: true
argument-hint: <run-dir>
---

# Resolve issue (headless)

You are running **without a human in the loop** (`claude -p`). Nobody will
answer a question or approve a gate, so this skill compresses the
feature-research → feature-plan → feature-implement pipeline into a single
autonomous pass. The trade-off is that the two approval gates of that pipeline
are replaced by an honest final verdict: the human reviews the branch and the
files in the run directory afterwards, and the harness script reports whether
you finished.

**The one rule that matters most:** report `completed` only if the issue is
actually resolved, committed, and the scoped checks pass. Anything less is
`failed` with a clear reason. A truthful `failed` is useful; a false
`completed` is worse than doing nothing, because the harness trusts it.

## Inputs

The argument is a run directory (`$ARGUMENTS`), e.g.
`.harness/runs/issue-123-20260928-101500/`. It contains:

| File | Contents |
|---|---|
| `issue.md` | Issue number, title, URL, labels, body and comments (read this first) |
| `issue.json` | The raw GitHub API payload, if you need a field not in `issue.md` |
| `meta.json` | `branch` you are on, `base` branch, `repo` |

The harness has already created and checked out a dedicated branch
(`meta.json → branch`). Stay on it: don't switch branches, don't push, don't
open PRs, don't touch `main`.

Everything you write for the human goes into the run directory — **not** into
`docs/plans/`, so the repo diff only contains the actual fix.

## 1. Understand the issue

Read `issue.md`. Decide whether this is actionable as code in this repo:

- A bug report, a small feature, a refactor, a docs fix → proceed.
- A question, a discussion, a duplicate, something that needs product decisions
  you can't infer, credentials/infra you don't have, or a change in another
  repo → stop and finish with `failed` (reason: `not_actionable` /
  `needs_clarification`), explaining what a human would need to decide.

When something is ambiguous but a reasonable default exists, pick it and write
it down under "Assumptions" in the plan rather than failing.

## 2. Research

Explore the codebase the way `feature-research` would: find where the relevant
behavior lives, similar patterns to copy, the packages affected, schema and API
surface. For bugs, locate the root cause — reproduce it with a failing test when
feasible, because that test is also your proof of the fix.

## 3. Plan

Write `<run-dir>/plan.md`, concise, with these sections:

- **Problem** — one paragraph, in your own words.
- **Root cause / approach** — what you'll change and why.
- **Assumptions** — anything you decided without asking.
- **Files** — files to create/modify.
- **Tests** — concrete test cases.

Scope check: this repo flags PRs over ~500 lines or ~10 files. If the plan
clearly exceeds that, don't implement a half of it — finish with `failed`
(reason: `too_large`) and leave the plan as the deliverable.

## 4. Implement

- Match surrounding conventions (imports, naming, error handling, layout). Read
  neighbouring files before editing a package.
- Tests: Vitest `*.test.ts(x)` next to the code under test. Playwright only if
  truly necessary.
- If the plan turns out to be wrong, update `plan.md` and adapt — you are the
  reviewer now, so keep the plan truthful.

## 5. Verify

Run checks scoped to what you touched:

| Check | Command |
|---|---|
| Tests | `yarn vitest run <changed test paths>` |
| Type-check | `yarn turbo run type-check --filter=@calcom/<pkg>` |
| Lint | `yarn eslint <changed files>` |
| Build | only if the change could plausibly break it: `yarn turbo run build --filter=@calcom/<pkg>` |

Fix what you broke and re-run. A check that can't run in this environment (e.g.
needs a database) is `skipped` with a note — not `pass`. A check that fails for
reasons clearly unrelated to your change (pre-existing failure) is `fail` with
a note saying so; judge whether it still lets you call the issue resolved.

## 6. Commit

Commit on the current branch with a conventional message referencing the issue,
e.g. `fix(bookings): handle null timezone (#123)`. Stage only the files you
intended to change — never the `.harness/` directory. Don't push.

## 7. Write the deliverables

In the run directory:

- `summary.md` — what changed and why, files touched, the checks table
  (check / command / pass·fail·skipped / notes), assumptions, and anything the
  human reviewer should look at closely.
- `pr.md` — only when completed: fill `.github/PULL_REQUEST_TEMPLATE.md` for
  this change, `Fixes #<issue>` wired in, mandatory checkboxes kept (tick only
  what's actually true), visual demo left as a placeholder.

Write `summary.md` on failure too — explain how far you got and what blocks it.
If you already changed code before failing, still commit it (message prefixed
`wip:`) so the work isn't lost, and say so.

## 8. Final answer

Your final message is parsed as structured output by the harness (a JSON
schema is enforced). Fill it truthfully:

- `status`: `completed` only if steps 4–6 succeeded and the checks you ran pass
  (or failures are demonstrably pre-existing). Otherwise `failed`.
- `failure_reason`: required when failed — one of `not_actionable`,
  `needs_clarification`, `too_large`, `checks_failing`, `blocked`, `other`.
- `summary`: 1–3 sentences a human reads in the terminal.
- `commits`, `files_changed`, `checks`: what actually happened.
