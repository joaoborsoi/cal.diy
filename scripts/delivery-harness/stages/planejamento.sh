#!/usr/bin/env bash
#
# Stage `planejamento`: Claude (skill harness-plan) writes <run-dir>/plan.md.
# Facts are observed here, not taken from the agent: the plan file exists, has
# the required sections, and no repo file was touched.
#
# Usage: scripts/delivery-harness/stages/planejamento.sh <issue> <run-dir> <state-dir>
# Env: GITHUB_REPOSITORY, GITHUB_TOKEN, GH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN

set -uo pipefail
ISSUE="$1" RUN_DIR="$2" STATE_DIR="$3"
# Tooling comes from HARNESS_HOME (a copy taken from the base branch before any
# agent branch is checked out), so code on the agent branch never replaces it.
ROOT="${HARNESS_HOME:-$(git rev-parse --show-toplevel)}"
HERE="$ROOT/scripts/delivery-harness"
mkdir -p "$RUN_DIR"

"$ROOT/scripts/issue-ambiguity/fetch-issue.sh" "$GITHUB_REPOSITORY" "$ISSUE" "$RUN_DIR" || exit 1
cp "$STATE_DIR/feedback.md" "$RUN_DIR/feedback.md"
# Revising a plan: give the agent the version the human asked to change.
PREV="$(jq -r '.plan_comment_id // empty' "$STATE_DIR/state.json")"
[[ -n "$PREV" ]] && gh api "repos/$GITHUB_REPOSITORY/issues/comments/$PREV" --jq .body > "$RUN_DIR/previous-plan.md"

"$HERE/run-agent.sh" harness-plan "$RUN_DIR" "$HERE/schemas/plan.json" plan
AGENT_OK=$?

DIRTY="$(git status --porcelain | awk '{print $2}' | jq -R . | jq -s .)"
MISSING="$(node --input-type=module -e '
  const { missingPlanSections } = await import(process.argv[1]);
  const fs = await import("node:fs");
  const md = fs.existsSync(process.argv[2]) ? fs.readFileSync(process.argv[2], "utf8") : "";
  console.log(JSON.stringify(missingPlanSections(md)));
' "$HERE/lib.mjs" "$RUN_DIR/plan.md")"

jq -n --argjson ok "$([[ $AGENT_OK -eq 0 ]] && echo true || echo false)" \
  --argjson present "$([[ -s "$RUN_DIR/plan.md" ]] && echo true || echo false)" \
  --argjson missing "$MISSING" --argjson dirty "$DIRTY" \
  --slurpfile r "$RUN_DIR/claude-result.json" '{
    agent_ok: $ok,
    agent_error: (if $ok then null else ($r[0].subtype // "no structured result") end),
    status: $r[0].structured_output.status,
    summary: $r[0].structured_output.summary,
    plan_present: $present,
    plan_missing_sections: $missing,
    repo_clean: ($dirty | length == 0),
    dirty_files: $dirty
  }' > "$RUN_DIR/facts.json"

{
  if jq -e '.structured_output.status == "needs_clarification"' "$RUN_DIR/claude-result.json" >/dev/null; then
    echo "**O agente precisa de respostas antes de planejar:**"
    echo
    jq -r '.structured_output.questions[]? | "- [ ] \(.)"' "$RUN_DIR/claude-result.json"
    echo
  fi
  [[ -s "$RUN_DIR/plan.md" ]] && { echo "<!-- delivery-harness:plan -->"; cat "$RUN_DIR/plan.md"; echo; }
} > "$RUN_DIR/body.md"
