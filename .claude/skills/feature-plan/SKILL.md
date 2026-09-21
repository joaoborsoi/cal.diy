---
name: feature-plan
description: >-
  Step 2 of the feature-development pipeline (feature-research → feature-plan →
  feature-implement). Turns a docs/plans/<slug>/research.md into a concrete
  technical plan at docs/plans/<slug>/plan.md — naming the files, procedures,
  schema changes, and test cases involved — then stops for the user's explicit
  approval before handing off to feature-implement. Use this when a research
  doc already exists and the user wants to move to planning, when the
  feature-research skill hands off to you (invoked with a slug argument), or
  when the user directly asks to "write a plan" or "spec out the implementation"
  for a feature that's already been discussed. Never let feature-implement start
  without an approved plan produced here.
---

# Feature plan

This is the middle of three chained skills, and it holds the pipeline's first
hard gate: nothing gets implemented until the user has read and approved a
concrete plan. That gate exists because the cost of a wrong plan is a few
minutes of revision, while the cost of a wrong implementation is a much bigger
rewrite — so it's worth being genuinely concrete here rather than vague and fast.

## 1. Find the research

If invoked with a slug argument, read `docs/plans/<slug>/research.md`. If
invoked directly by the user without one, look for a matching
`docs/plans/*/research.md`; if none exists or it doesn't cover what the user is
now asking for, either run a quick, scoped version of the research steps
yourself (codebase search + a few clarifying questions) or suggest running
`feature-research` first — use judgment based on how much is missing.

If `docs/plans/<slug>/plan.md` already exists, you're likely revising a plan the
user gave feedback on — read it and the user's feedback before rewriting rather
than starting over.

## 2. Write the plan

Write `docs/plans/<slug>/plan.md` using `references/plan-template.md`. Fill
every section; use "None" or "N/A — because …" rather than deleting a section,
so a reviewer can see it was considered.

The plan should be specific enough to act on without further research: name the
files you expect to create or change, the procedures you'll add, the schema
diff, the concrete test cases. Pull the codebase findings from `research.md`
rather than re-deriving them — if something there is thin or wrong, fix it
inline rather than guessing new context.

## 3. Approval gate — stop here

Present a short summary in the chat (3–6 bullets) and the path to the plan, and
ask the user to review and approve it. **Do not hand off to `feature-implement`
until the user explicitly approves.** If they ask for changes, edit the plan,
summarize what changed, and ask again — this loop is normal and cheap, that's
the point of the gate.

## 4. Hand off to feature-implement

Once approved, continue the pipeline yourself by invoking the
`feature-implement` skill with the slug as its argument, e.g.:

```
Skill(skill: "feature-implement", args: "<slug>")
```

Tell the user you're moving on to implementation.
