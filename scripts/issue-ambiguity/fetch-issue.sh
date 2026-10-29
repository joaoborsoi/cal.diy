#!/usr/bin/env bash
#
# Fetch a GitHub issue and its comments into a directory:
#   issue.json, comments.json  raw API payloads
#   issue.md                   title, metadata, body and comments as Markdown
#
# Usage: scripts/issue-ambiguity/fetch-issue.sh <owner/repo> <number> <out-dir>
# Env: GITHUB_TOKEN (optional; needed for private repos / higher rate limits)
# Exit codes: 0 = ok, 2 = error (message on stderr)

set -uo pipefail

die() { echo "error: $*" >&2; exit 2; }

[[ $# -eq 3 ]] || die "usage: $0 <owner/repo> <number> <out-dir>"
REPO="$1" ISSUE="$2" OUT="$3"
for bin in jq curl; do
  command -v "$bin" >/dev/null || die "'$bin' not found in PATH"
done
mkdir -p "$OUT" || die "couldn't create $OUT"

gh_get() {
  local auth=()
  [[ -n "${GITHUB_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL -H "Accept: application/vnd.github+json" "${auth[@]}" "https://api.github.com/repos/$REPO/$1"
}

gh_get "issues/$ISSUE" > "$OUT/issue.json" || die "couldn't fetch issue $REPO#$ISSUE (set GITHUB_TOKEN for private repos)"
jq -e 'has("pull_request") | not' "$OUT/issue.json" >/dev/null || die "$REPO#$ISSUE is a pull request, not an issue"
gh_get "issues/$ISSUE/comments?per_page=100" > "$OUT/comments.json" || echo '[]' > "$OUT/comments.json"

jq -r --slurpfile comments "$OUT/comments.json" '
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
' "$OUT/issue.json" > "$OUT/issue.md"
