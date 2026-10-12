#!/usr/bin/env bash
#
# Score how ambiguous a GitHub issue is (0–3) with an LLM judge applying
# .claude/skills/resolve-issue/ambiguity-rubric.md. The judge's answer is
# post-processed by deterministic floor rules (lib.mjs) and saved with its
# audit trail.
#
# Usage:
#   scripts/issue-ambiguity/score.sh <issue> [options]
#   scripts/issue-ambiguity/score.sh --file <issue.md> [options]
#
#   <issue>  123 | owner/repo#123 | https://github.com/owner/repo/issues/123
#
# Options:
#   --repo owner/repo       Repo for a bare issue number (default: origin)
#   --out-dir <dir>         Where to write results (default .harness/ambiguity/<subject>-<ts>/)
#   --samples <n>           Independent judge runs, aggregated by median (default 3)
#   --model <model>         Model for the judge (default: claude's default)
#   --effort <level>        Effort for the judge
#   --max-budget-usd <n>    Spending cap per judge run
#   --no-code               Don't let the judge read the repository
#
# Output: ambiguity.json (decision + audit), ambiguity.md (report), issue.md
# Exit codes: 0 = proceed (score 0–1), 1 = needs clarification (2–3), 2 = error

set -uo pipefail

usage() { sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "error: $*" >&2; exit 2; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUE_ARG="" FILE="" REPO="" OUT_DIR="" JUDGE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --samples|--model|--effort|--max-budget-usd) JUDGE_ARGS+=("$1" "${2:-}"); shift 2 ;;
    --no-code) JUDGE_ARGS+=("$1"); shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) [[ -z "$ISSUE_ARG" ]] || die "only one issue per run"; ISSUE_ARG="$1"; shift ;;
  esac
done

for bin in claude node; do
  command -v "$bin" >/dev/null || die "'$bin' not found in PATH"
done
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT"

if [[ -n "$FILE" ]]; then
  [[ -z "$ISSUE_ARG" ]] || die "--file can't be combined with an issue"
  [[ -f "$FILE" ]] || die "no such file: $FILE"
  SUBJECT="$(basename "$FILE" .md)"
  RUN_DIR="${OUT_DIR:-.harness/ambiguity/file-$SUBJECT-$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$RUN_DIR" || die "couldn't create $RUN_DIR"
  [[ "$(realpath "$FILE")" == "$(realpath -m "$RUN_DIR/issue.md")" ]] || cp "$FILE" "$RUN_DIR/issue.md"
else
  [[ -n "$ISSUE_ARG" ]] || { usage; exit 2; }
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
  SUBJECT="$REPO#$ISSUE"
  RUN_DIR="${OUT_DIR:-.harness/ambiguity/issue-$ISSUE-$(date +%Y%m%d-%H%M%S)}"
  "$HERE/fetch-issue.sh" "$REPO" "$ISSUE" "$RUN_DIR" || exit 2
fi

echo "› scoring ambiguity of $SUBJECT" >&2
node "$HERE/judge.mjs" --issue-file "$RUN_DIR/issue.md" --subject "$SUBJECT" \
  --out "$RUN_DIR/ambiguity.json" --report "$RUN_DIR/ambiguity.md" "${JUDGE_ARGS[@]}"
CODE=$?
[[ $CODE -le 1 ]] || die "judge failed"

cat "$RUN_DIR/ambiguity.md"
echo "run dir: $RUN_DIR"
exit "$CODE"
