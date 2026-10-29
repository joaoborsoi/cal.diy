#!/usr/bin/env bash
#
# Stage `implementacao`: put the harness branch on top of its last pushed
# commit (or main), let Claude (skill harness-implement) implement the approved
# plan, then push and open/update a draft PR. Facts are observed from git and
# the PR, not taken from the agent.
#
# Usage: scripts/delivery-harness/stages/implementacao.sh <issue> <run-dir> <state-dir>
# Env: GITHUB_REPOSITORY, GITHUB_TOKEN, GH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, BASE_BRANCH (default main)

set -uo pipefail
ISSUE="$1" RUN_DIR="$2" STATE_DIR="$3"
# Tooling comes from HARNESS_HOME (a copy taken from the base branch before any
# agent branch is checked out), so code on the agent branch never replaces it.
ROOT="${HARNESS_HOME:-$(git rev-parse --show-toplevel)}"
HERE="$ROOT/scripts/delivery-harness"
BASE="${BASE_BRANCH:-main}"
BRANCH="$(jq -r .branch "$STATE_DIR/state.json")"
PLAN_ID="$(jq -r '.plan_comment_id // empty' "$STATE_DIR/state.json")"
mkdir -p "$RUN_DIR"

fail_facts() { jq -n --arg err "$1" '{agent_ok: false, agent_error: $err}' > "$RUN_DIR/facts.json"; exit 0; }

"$ROOT/scripts/issue-ambiguity/fetch-issue.sh" "$GITHUB_REPOSITORY" "$ISSUE" "$RUN_DIR" || fail_facts "could not fetch the issue"
[[ -n "$PLAN_ID" ]] || fail_facts "no approved plan on record"
gh api "repos/$GITHUB_REPOSITORY/issues/comments/$PLAN_ID" --jq .body > "$RUN_DIR/plan.md" || fail_facts "could not read the approved plan"
cp "$STATE_DIR/feedback.md" "$RUN_DIR/feedback.md"

# Continue the branch if a previous attempt pushed it, so feedback rounds stack.
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
if git fetch --quiet --depth=50 "$REMOTE" "$BRANCH" 2>/dev/null; then
  git switch --quiet -C "$BRANCH" FETCH_HEAD
else
  git switch --quiet -C "$BRANCH" "origin/$BASE" 2>/dev/null || git switch --quiet -C "$BRANCH"
fi
START_SHA="$(git rev-parse HEAD)"
jq -n --arg branch "$BRANCH" --arg base "$BASE" --arg start "$START_SHA" --argjson issue "$ISSUE" \
  --arg repo "$GITHUB_REPOSITORY" '{repo:$repo, issue:$issue, branch:$branch, base:$base, start_sha:$start}' > "$RUN_DIR/meta.json"

"$HERE/run-agent.sh" harness-implement "$RUN_DIR" "$HERE/schemas/implement.json" implement
AGENT_OK=$?

NEW_COMMITS="$(git rev-list --count "$START_SHA..HEAD")"
DIRTY="$(git status --porcelain | awk '{print $2}' | jq -R . | jq -s .)"
PUSHED=false PR="" LINES=0 FILES=0

if [[ "$NEW_COMMITS" -gt 0 ]]; then
  # Credentials go to git only on the command line, after the agent is done.
  git push --quiet "$REMOTE" "HEAD:refs/heads/$BRANCH" && PUSHED=true
fi

if [[ "$PUSHED" == true ]]; then
  PR="$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"
  if [[ -z "$PR" ]]; then
    TITLE="$(jq -r .title "$RUN_DIR/issue.json")"
    if [[ -s "$RUN_DIR/pr.md" ]]; then cp "$RUN_DIR/pr.md" "$RUN_DIR/pr-body.md"; else printf 'Refs #%s\n' "$ISSUE" > "$RUN_DIR/pr-body.md"; fi
    printf '\n\n---\nAberto pelo harness de entrega a partir da issue #%s (plano aprovado: %s).\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' \
      "$ISSUE" "$(gh api "repos/$GITHUB_REPOSITORY/issues/comments/$PLAN_ID" --jq .html_url)" >> "$RUN_DIR/pr-body.md"
    URL="$(gh pr create --repo "$GITHUB_REPOSITORY" --draft --base "$BASE" --head "$BRANCH" \
      --title "$TITLE (#$ISSUE)" --body-file "$RUN_DIR/pr-body.md")" && PR="${URL##*/}"
  fi
fi
if [[ -n "$PR" ]]; then
  read -r LINES FILES < <(gh pr view "$PR" --repo "$GITHUB_REPOSITORY" --json additions,deletions,changedFiles \
    --jq '"\(.additions + .deletions) \(.changedFiles)"')
fi

jq -n --argjson ok "$([[ $AGENT_OK -eq 0 ]] && echo true || echo false)" \
  --argjson commits "$NEW_COMMITS" --argjson dirty "$DIRTY" --argjson pushed "$PUSHED" \
  --arg pr "$PR" --argjson lines "${LINES:-0}" --argjson files "${FILES:-0}" \
  --slurpfile r "$RUN_DIR/claude-result.json" '{
    agent_ok: $ok,
    agent_error: (if $ok then null else ($r[0].subtype // "no structured result") end),
    status: $r[0].structured_output.status,
    failure_reason: $r[0].structured_output.failure_reason,
    summary: $r[0].structured_output.summary,
    agent_checks: ($r[0].structured_output.checks // []),
    new_commits: $commits,
    repo_clean: ($dirty | length == 0),
    dirty_files: $dirty,
    pushed: $pushed,
    pr_number: (if $pr == "" then null else ($pr | tonumber) end),
    changed_lines: $lines,
    changed_files: $files
  }' > "$RUN_DIR/facts.json"

{
  jq -r '.structured_output.summary // empty' "$RUN_DIR/claude-result.json"
  echo
  jq -r 'if (.structured_output.checks // []) | length > 0 then
      "**Checks que o agente rodou:**\n\n| check | resultado | notas |\n|---|---|---|\n"
      + ([.structured_output.checks[] | "| \(.name) | \(.result) | \(.notes // "" | gsub("\\|"; "\\|")) |"] | join("\n"))
    else empty end' "$RUN_DIR/claude-result.json"
  echo
  [[ -s "$RUN_DIR/summary.md" ]] && { echo "<details><summary>Resumo do agente</summary>"; echo; cat "$RUN_DIR/summary.md"; echo; echo "</details>"; }
} > "$RUN_DIR/body.md"
