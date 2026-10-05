---
name: pr-autoapproval
description: >-
  Checks whether a pull request (or the current branch's diff) qualifies for
  automatic approval under the policy "frontend changes of at most 200 lines of
  code can be auto-approved". Collects evidence (changed files, line counts,
  pinned commit SHAs, the measured diff), runs the deterministic control in
  scripts/pr-autoapproval/, and reports the verdict with its audit trail.
  Optionally posts the result to the PR and approves it when the control
  passes. Use when the user asks whether a PR can be auto-approved, wants the
  auto-approval policy checked, or asks to auto-approve a small frontend PR.
argument-hint: "[<pr> | --local [--base <ref>] [--head <ref>]] [--apply]"
---

# PR auto-approval

Policy (`scripts/pr-autoapproval/policy.json`):

> Frontend changes that do not exceed 200 lines of code may be automatically
> approved.

**The one rule that matters most:** the verdict comes from the scripts, never
from you. You collect evidence, run the control, and report. You do not
reclassify files, re-count lines, or "approve anyway" because a change looks
harmless. If you believe the verdict is wrong, say so and propose a change to
`policy.json` (a reviewed PR of its own) — don't act on your opinion.

## Inputs

`$ARGUMENTS` may contain:

| Argument | Meaning |
|---|---|
| `123`, `owner/repo#123`, PR URL | Check that GitHub PR |
| `--local [--base <ref>] [--head <ref>]` | Check a local diff (default `main...HEAD`) |
| _(nothing)_ | Same as `--local` on the current branch |
| `--apply` | Post the result to the PR, approving it if the control passes (PR mode only) |

Without `--apply` this skill is read-only: nothing is posted to GitHub.

## 1. Run the control

```bash
scripts/pr-autoapproval/check.sh <pr | --local ...>
```

It fetches the PR's commits (`refs/pull/<n>/head`) or resolves the local refs,
diffs head against the merge-base, and writes a run directory
(`.harness/pr-autoapproval/<subject>-<timestamp>/`):

| File | Contents |
|---|---|
| `evidence.json` | Pinned SHAs, PR metadata, each changed file with +/-, binary flag, server-code markers |
| `diff.patch` | The exact diff that was measured |
| `policy.json` | Copy of the policy applied |
| `decision.json` | Verdict, each check, each file's classification and the rule that decided it, sha256 of policy and evidence |
| `report.md` | Human-readable summary |

Exit code: `0` auto-approve, `1` manual review, `2` error. On `2`, report the
error (e.g. private repo without `GITHUB_TOKEN`, unknown ref) and stop — don't
fall back to counting lines yourself.

Uncommitted changes are not part of a local check; if `git status` shows any,
mention that they weren't evaluated.

## 2. Gather context (does not change the verdict)

Read `report.md` and `decision.json`. For PR mode, also note from
`evidence.json → subject`: `state`, `draft`, and whether `github_stats` differs
from the measured totals (GitHub detects renames; the control deliberately
doesn't — explain the difference if it matters).

Skim `diff.patch` for things the reviewer should know even when the control
passes, and list them as **observations**, e.g. a file classified as frontend
that actually changes auth, payments or data-fetching logic, or a frontend
file that the classification rules missed. These are inputs for a future
policy change, not overrides.

## 3. Report

Reply with:

1. The verdict as the first line: **AUTO-APPROVE** or **MANUAL REVIEW**.
2. The checks table from `report.md` (failed checks first) and the totals.
3. For manual review, exactly which files/rules or which count caused it.
4. Observations from step 2, if any.
5. The run directory path and the evidence/policy hashes, so the decision can
   be audited and reproduced with
   `node scripts/pr-autoapproval/evaluate.mjs --evidence <run-dir>/evidence.json --policy <run-dir>/policy.json`.

## 4. Apply (only with `--apply`, PR mode)

Skip this step entirely unless the user passed `--apply` or explicitly asked
to approve/post in this conversation.

1. Re-read the PR (`mcp__github__pull_request_read`, method `get`) and confirm
   `head.sha` still equals `evidence.json → subject.head_sha` and the PR is open
   and not a draft. If anything changed, don't post — run the control again.
2. Submit a review with `mcp__github__pull_request_review_write` (method
   `create`, with `event`):
   - decision `auto-approve` → `event: APPROVE`
   - decision `manual-review` → `event: COMMENT` (never `APPROVE`, never
     `REQUEST_CHANGES` — the policy only says a human must review)

   Body: the contents of `report.md` plus a last line
   `policy sha256 <…> · evidence sha256 <…> · head <sha>`.
3. GitHub rejects approving your own PR; if that happens, report it and post a
   `COMMENT` review instead. Never merge.
