#!/usr/bin/env bash
#
# PR auto-approval control: collect evidence for a PR (or a local diff),
# evaluate it against scripts/pr-autoapproval/policy.json and save everything
# to a run directory. The decision is fully deterministic — no LLM involved.
#
# Usage:
#   scripts/pr-autoapproval/check.sh <pr> [--repo owner/repo] [--out-dir <dir>]
#   scripts/pr-autoapproval/check.sh --local [--base <ref>] [--head <ref>] [--out-dir <dir>]
#
#   <pr>  123 | owner/repo#123 | https://github.com/owner/repo/pull/123
#
# Run dir (default .harness/pr-autoapproval/<subject>-<timestamp>/):
#   evidence.json  changed files, line counts, content markers, pinned SHAs
#   diff.patch     the exact diff that was measured
#   policy.json    copy of the policy that was applied
#   decision.json  per-check and per-file verdicts, hashes of policy/evidence
#   report.md      human-readable summary
#
# Env: GITHUB_TOKEN (optional; needed for private repos / higher rate limits)
# Exit codes: 0 = auto-approve, 1 = manual review, 2 = error

set -uo pipefail

usage() { sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "error: $*" >&2; exit 2; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PR_ARG="" REPO="" LOCAL=0 BASE="" HEAD="" OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --local) LOCAL=1; shift ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --head) HEAD="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) [[ -z "$PR_ARG" ]] || die "only one PR per run"; PR_ARG="$1"; shift ;;
  esac
done

command -v node >/dev/null || die "'node' not found in PATH"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT"

COLLECT_ARGS=()
if [[ $LOCAL -eq 1 ]]; then
  [[ -z "$PR_ARG" ]] || die "--local can't be combined with a PR"
  [[ -n "$BASE" ]] && COLLECT_ARGS+=(--base "$BASE")
  [[ -n "$HEAD" ]] && COLLECT_ARGS+=(--head "$HEAD")
  SUBJECT="local-$(git rev-parse --short "${HEAD:-HEAD}" 2>/dev/null || echo unknown)"
else
  [[ -n "$PR_ARG" ]] || { usage; exit 2; }
  [[ -z "$BASE$HEAD" ]] || die "--base/--head only apply with --local"
  if [[ "$PR_ARG" =~ ^https://github\.com/([^/]+/[^/]+)/pull/([0-9]+) ]]; then
    REPO="${BASH_REMATCH[1]}" PR="${BASH_REMATCH[2]}"
  elif [[ "$PR_ARG" =~ ^([^/#]+/[^/#]+)#([0-9]+)$ ]]; then
    REPO="${BASH_REMATCH[1]}" PR="${BASH_REMATCH[2]}"
  elif [[ "$PR_ARG" =~ ^#?([0-9]+)$ ]]; then
    PR="${BASH_REMATCH[1]}"
  else
    die "unrecognised PR: $PR_ARG"
  fi
  COLLECT_ARGS+=(--pr "$PR")
  [[ -n "$REPO" ]] && COLLECT_ARGS+=(--repo "$REPO")
  SUBJECT="pr-$PR"
fi

RUN_DIR="${OUT_DIR:-.harness/pr-autoapproval/$SUBJECT-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$RUN_DIR" || die "couldn't create $RUN_DIR"
cp "$HERE/policy.json" "$RUN_DIR/policy.json"

node "$HERE/collect-evidence.mjs" "${COLLECT_ARGS[@]}" --policy "$RUN_DIR/policy.json" \
  --out "$RUN_DIR/evidence.json" --patch "$RUN_DIR/diff.patch" || die "evidence collection failed"

node "$HERE/evaluate.mjs" --evidence "$RUN_DIR/evidence.json" --policy "$RUN_DIR/policy.json" \
  --out "$RUN_DIR/decision.json" --report "$RUN_DIR/report.md"
CODE=$?
[[ $CODE -le 1 ]] || die "evaluation failed"

cat "$RUN_DIR/report.md"
echo "run dir: $RUN_DIR"
exit "$CODE"
