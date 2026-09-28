#!/usr/bin/env bash
#
# Headless coding agent: resolve one GitHub issue with `claude -p` + the
# `resolve-issue` skill, save everything to a run directory, and report whether
# the agent finished.
#
# Usage:
#   scripts/agent-issue.sh <issue> [options]
#
#   <issue>  123 | owner/repo#123 | https://github.com/owner/repo/issues/123
#            (a bare number uses the repo of the `origin` remote)
#
# Options:
#   --repo owner/repo         Repo for a bare issue number
#   --model <model>           Model passed to claude (default: claude's default)
#   --max-budget-usd <n>      Stop the agent after spending this much
#   --permission-mode <mode>  claude permission mode (default: acceptEdits + allowlist)
#   --stay                    Stay on the agent branch afterwards (default: go back)
#   -h, --help                Show this help
#
# Env: GITHUB_TOKEN (optional; needed for private repos / higher rate limits)
#
# Exit codes: 0 = completed, 1 = failed, 2 = usage/setup error

set -uo pipefail

usage() { sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'; }

if [[ -t 1 ]]; then
  RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' DIM=$'\e[2m' BOLD=$'\e[1m' RESET=$'\e[0m'
else
  RED="" GREEN="" YELLOW="" DIM="" BOLD="" RESET=""
fi

die() { echo "${RED}error:${RESET} $*" >&2; exit 2; }
info() { echo "${DIM}›${RESET} $*"; }

# --- args -------------------------------------------------------------------

ISSUE_ARG="" REPO="" MODEL="" BUDGET="" PERMISSION_MODE="" STAY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    --max-budget-usd) BUDGET="${2:-}"; shift 2 ;;
    --permission-mode) PERMISSION_MODE="${2:-}"; shift 2 ;;
    --stay) STAY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) [[ -z "$ISSUE_ARG" ]] || die "only one issue per run"; ISSUE_ARG="$1"; shift ;;
  esac
done
[[ -n "$ISSUE_ARG" ]] || { usage; exit 2; }

for bin in claude jq curl git; do
  command -v "$bin" >/dev/null || die "'$bin' not found in PATH"
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT"

if [[ "$ISSUE_ARG" =~ ^https://github\.com/([^/]+/[^/]+)/issues/([0-9]+) ]]; then
  REPO="${BASH_REMATCH[1]}" ISSUE="${BASH_REMATCH[2]}"
elif [[ "$ISSUE_ARG" =~ ^([^/#]+/[^/#]+)#([0-9]+)$ ]]; then
  REPO="${BASH_REMATCH[1]}" ISSUE="${BASH_REMATCH[2]}"
elif [[ "$ISSUE_ARG" =~ ^#?([0-9]+)$ ]]; then
  ISSUE="${BASH_REMATCH[1]}"
  if [[ -z "$REPO" ]]; then
    REPO="$(git remote get-url origin 2>/dev/null | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
    [[ "$REPO" =~ ^[^/]+/[^/]+$ ]] || die "couldn't infer repo from origin; pass --repo owner/repo"
  fi
else
  die "unrecognised issue: $ISSUE_ARG"
fi

# --- preflight: clean tree, dedicated branch ---------------------------------

[[ -z "$(git status --porcelain)" ]] || die "working tree is not clean; commit or stash first"

BASE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BASE_SHA="$(git rev-parse HEAD)"
TS="$(date +%Y%m%d-%H%M%S)"
BRANCH="agent/issue-$ISSUE" RUN_DIR=".harness/runs/issue-$ISSUE-$TS" n=1
git show-ref --quiet "refs/heads/$BRANCH" && BRANCH="$BRANCH-$TS"
while git show-ref --quiet "refs/heads/$BRANCH" || [[ -e "$RUN_DIR" ]]; do
  n=$((n + 1)) BRANCH="agent/issue-$ISSUE-$TS-$n" RUN_DIR=".harness/runs/issue-$ISSUE-$TS-$n"
done
mkdir -p "$RUN_DIR"

# --- fetch the issue ---------------------------------------------------------

gh_get() {
  local auth=()
  [[ -n "${GITHUB_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL -H "Accept: application/vnd.github+json" "${auth[@]}" "https://api.github.com/repos/$REPO/$1"
}

info "fetching $REPO#$ISSUE"
gh_get "issues/$ISSUE" > "$RUN_DIR/issue.json" || die "couldn't fetch issue $REPO#$ISSUE (set GITHUB_TOKEN for private repos)"
jq -e 'has("pull_request") | not' "$RUN_DIR/issue.json" >/dev/null || die "$REPO#$ISSUE is a pull request, not an issue"
gh_get "issues/$ISSUE/comments?per_page=100" > "$RUN_DIR/comments.json" || echo '[]' > "$RUN_DIR/comments.json"

jq -r --slurpfile comments "$RUN_DIR/comments.json" '
  "# #\(.number): \(.title)\n",
  "- URL: \(.html_url)",
  "- State: \(.state)",
  "- Author: \(.user.login)",
  "- Labels: \([.labels[].name] | join(", ") | if . == "" then "none" else . end)\n",
  "## Body\n",
  (.body // "_(empty)_"),
  "\n## Comments\n",
  (if ($comments[0] | length) == 0 then "_(none)_"
   else $comments[0][] | "### \(.user.login) — \(.created_at)\n\n\(.body)\n" end)
' "$RUN_DIR/issue.json" > "$RUN_DIR/issue.md"

TITLE="$(jq -r .title "$RUN_DIR/issue.json")"
jq -n --arg repo "$REPO" --argjson issue "$ISSUE" --arg title "$TITLE" \
  --arg branch "$BRANCH" --arg base "$BASE_BRANCH" --arg base_sha "$BASE_SHA" \
  '{repo:$repo, issue:$issue, title:$title, branch:$branch, base:$base, base_sha:$base_sha}' \
  > "$RUN_DIR/meta.json"

git switch --quiet -c "$BRANCH" || die "couldn't create branch $BRANCH"
info "branch $BRANCH (from $BASE_BRANCH)"
info "run dir $RUN_DIR"

# --- run the agent -----------------------------------------------------------

RESULT_SCHEMA='{
  "type": "object",
  "properties": {
    "status": {"type": "string", "enum": ["completed", "failed"]},
    "failure_reason": {"type": "string", "enum": ["not_actionable", "needs_clarification", "too_large", "checks_failing", "blocked", "other"]},
    "summary": {"type": "string"},
    "commits": {"type": "array", "items": {"type": "string"}},
    "files_changed": {"type": "array", "items": {"type": "string"}},
    "checks": {"type": "array", "items": {"type": "object",
      "properties": {
        "name": {"type": "string"},
        "command": {"type": "string"},
        "result": {"type": "string", "enum": ["pass", "fail", "skipped"]},
        "notes": {"type": "string"}
      },
      "required": ["name", "result"]}}
  },
  "required": ["status", "summary"]
}'

CLAUDE_ARGS=(
  -p "/resolve-issue $RUN_DIR"
  --output-format stream-json --verbose
  --json-schema "$RESULT_SCHEMA"
  --append-system-prompt "You are running headless via scripts/agent-issue.sh. No human will answer questions or approve anything; decide, document, and finish."
)
[[ -n "$MODEL" ]] && CLAUDE_ARGS+=(--model "$MODEL")
[[ -n "$BUDGET" ]] && CLAUDE_ARGS+=(--max-budget-usd "$BUDGET")
if [[ -n "$PERMISSION_MODE" ]]; then
  CLAUDE_ARGS+=(--permission-mode "$PERMISSION_MODE")
else
  # Edits are auto-accepted; shell access is limited to what the skill needs.
  CLAUDE_ARGS+=(
    --permission-mode acceptEdits
    --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Skill"
      "Bash(yarn *)" "Bash(npx vitest *)" "Bash(npx tsc *)" "Bash(npx eslint *)" "Bash(node *)"
      "Bash(git status *)" "Bash(git diff *)" "Bash(git log *)" "Bash(git show *)"
      "Bash(git add *)" "Bash(git commit *)" "Bash(git rev-parse *)" "Bash(git grep *)"
      "Bash(ls *)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(wc *)"
      "Bash(find *)" "Bash(grep *)" "Bash(rg *)" "Bash(mkdir *)"
    --disallowedTools "Bash(git push *)" "Bash(git switch *)" "Bash(git checkout *)"
      "Bash(git reset *)" "Bash(git rebase *)"
  )
fi

echo
echo "${BOLD}Running agent on $REPO#$ISSUE:${RESET} $TITLE"
START=$(date +%s)

# Stream the transcript to disk and show one line per tool call as progress.
claude "${CLAUDE_ARGS[@]}" 2> "$RUN_DIR/claude.stderr" \
  | tee "$RUN_DIR/transcript.jsonl" \
  | jq -r --unbuffered '
      select(.type == "assistant") | .message.content[]? | select(.type == "tool_use")
      | "  → \(.name) \((.input.command // .input.file_path // .input.pattern // .input.skill // "") | tostring | gsub("\n"; " ") | .[0:110])"
    ' 2>/dev/null
CLAUDE_EXIT=${PIPESTATUS[0]}
ELAPSED=$(( $(date +%s) - START ))

# --- decide the status -------------------------------------------------------

jq -s 'map(select(.type == "result")) | last // {}' "$RUN_DIR/transcript.jsonl" > "$RUN_DIR/claude-result.json" 2>/dev/null \
  || echo '{}' > "$RUN_DIR/claude-result.json"

IS_ERROR=$(jq -r 'if has("is_error") then .is_error else true end' "$RUN_DIR/claude-result.json")
SUBTYPE=$(jq -r '.subtype // "no_result"' "$RUN_DIR/claude-result.json")
COST=$(jq -r '.total_cost_usd // 0 | . * 100 | round / 100' "$RUN_DIR/claude-result.json")
DENIALS=$(jq -r '.permission_denials // [] | length' "$RUN_DIR/claude-result.json")
AGENT_STATUS=$(jq -r '.structured_output.status // empty' "$RUN_DIR/claude-result.json")
COMMITS=$(git rev-list --count "$BASE_SHA..HEAD")
DIRTY=$(git status --porcelain | wc -l)

STATUS="failed" REASON=""
if [[ $CLAUDE_EXIT -ne 0 || "$IS_ERROR" == "true" ]]; then
  REASON="agent run errored (exit=$CLAUDE_EXIT, subtype=$SUBTYPE)"
elif [[ -z "$AGENT_STATUS" ]]; then
  REASON="agent returned no structured result"
elif [[ "$AGENT_STATUS" != "completed" ]]; then
  REASON="agent reported failure: $(jq -r '.structured_output.failure_reason // "other"' "$RUN_DIR/claude-result.json")"
elif [[ "$COMMITS" -eq 0 ]]; then
  REASON="agent reported completed but made no commit"
elif jq -e '[.structured_output.checks[]? | select(.result == "fail")] | length > 0' "$RUN_DIR/claude-result.json" >/dev/null; then
  STATUS="completed" REASON="completed with failing checks the agent judged pre-existing — review them"
else
  STATUS="completed"
fi

jq --arg status "$STATUS" --arg reason "$REASON" --argjson exit "$CLAUDE_EXIT" \
   --argjson commits "$COMMITS" --argjson elapsed "$ELAPSED" --slurpfile meta "$RUN_DIR/meta.json" '
  $meta[0] + {
    status: $status, reason: $reason, elapsed_s: $elapsed, commits_on_branch: $commits,
    claude: {exit_code: $exit, subtype: (.subtype // null), is_error: (.is_error // null),
             cost_usd: (.total_cost_usd // null), num_turns: (.num_turns // null),
             session_id: (.session_id // null), permission_denials: (.permission_denials // [])},
    agent: (.structured_output // null)
  }' "$RUN_DIR/claude-result.json" > "$RUN_DIR/result.json"
echo "$STATUS" > "$RUN_DIR/STATUS"

# --- report ------------------------------------------------------------------

echo
if [[ "$STATUS" == "completed" ]]; then
  echo "${GREEN}${BOLD}✔ COMPLETED${RESET}  $REPO#$ISSUE"
else
  echo "${RED}${BOLD}✘ FAILED${RESET}  $REPO#$ISSUE"
fi
[[ -n "$REASON" ]] && echo "  ${YELLOW}$REASON${RESET}"
SUMMARY=$(jq -r '.structured_output.summary // empty' "$RUN_DIR/claude-result.json")
[[ -n "$SUMMARY" ]] && echo "  $SUMMARY" | fold -s -w 100 | sed '2,$s/^/  /'
jq -r '.structured_output.checks[]? | "  [\(.result)] \(.name)\(if .notes then " — \(.notes)" else "" end)"' \
  "$RUN_DIR/claude-result.json"
echo "  ${DIM}branch $BRANCH · $COMMITS commit(s) · ${ELAPSED}s · \$$COST${RESET}"
[[ "$DENIALS" -gt 0 ]] && echo "  ${YELLOW}$DENIALS tool call(s) were denied — see result.json${RESET}"
echo "  ${DIM}results: $RUN_DIR/ ($(cd "$RUN_DIR" && ls -d result.json summary.md plan.md pr.md transcript.jsonl 2>/dev/null | paste -sd, | sed 's/,/, /g'))${RESET}"

if [[ $STAY -eq 0 ]]; then
  if [[ "$DIRTY" -eq 0 ]]; then
    git switch --quiet "$BASE_BRANCH" && info "back on $BASE_BRANCH"
  else
    echo "  ${YELLOW}uncommitted changes left on $BRANCH; staying there${RESET}"
  fi
fi

[[ "$STATUS" == "completed" ]] && exit 0 || exit 1
