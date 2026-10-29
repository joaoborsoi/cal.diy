#!/usr/bin/env bash
#
# Stage `triagem`: score the issue's ambiguity with the existing judge
# (scripts/issue-ambiguity/). Writes <run-dir>/facts.json and body.md.
#
# Usage: scripts/delivery-harness/stages/triagem.sh <issue> <run-dir>
# Env: GITHUB_REPOSITORY, GITHUB_TOKEN, HARNESS_AMBIGUITY_SAMPLES (default 3), HARNESS_MODEL

set -uo pipefail
ISSUE="$1" RUN_DIR="$2"
# Tooling comes from HARNESS_HOME (a copy taken from the base branch before any
# agent branch is checked out), so code on the agent branch never replaces it.
ROOT="${HARNESS_HOME:-$(git rev-parse --show-toplevel)}"
mkdir -p "$RUN_DIR"

if ! "$ROOT/scripts/issue-ambiguity/fetch-issue.sh" "$GITHUB_REPOSITORY" "$ISSUE" "$RUN_DIR"; then
  jq -n '{judge_exit: 2, score: null, error: "could not fetch the issue"}' > "$RUN_DIR/facts.json"
  exit 0
fi

ARGS=(--issue-file "$RUN_DIR/issue.md" --subject "$GITHUB_REPOSITORY#$ISSUE" --out "$RUN_DIR/ambiguity.json"
  --report "$RUN_DIR/ambiguity.md" --samples "${HARNESS_AMBIGUITY_SAMPLES:-3}")
[[ -n "${HARNESS_MODEL:-}" ]] && ARGS+=(--model "$HARNESS_MODEL")
env -u GH_TOKEN -u GITHUB_TOKEN node "$ROOT/scripts/issue-ambiguity/judge.mjs" "${ARGS[@]}" 2> "$RUN_DIR/judge.stderr"
EXIT=$?

if [[ $EXIT -le 1 && -f "$RUN_DIR/ambiguity.json" ]]; then
  jq --argjson exit "$EXIT" '{judge_exit: $exit, score, reason: (.failure_reason // .action), questions}' \
    "$RUN_DIR/ambiguity.json" > "$RUN_DIR/facts.json"
  {
    if [[ $EXIT -eq 1 ]]; then
      echo "**Antes de planejar, o autor precisa responder:**"
      echo
      jq -r '.questions[] | "- [ ] \(.)"' "$RUN_DIR/ambiguity.json"
      echo
      echo "Edite a issue (ou responda em um comentário) e comente \`/retomar\` para pontuar de novo, ou \`/aprovar\` para planejar assim mesmo."
      echo
    else
      jq -r 'if (.assumptions | length) > 0 then "**Premissas que o plano vai adotar:**\n\n" + (.assumptions | map("- " + .) | join("\n")) + "\n" else empty end' "$RUN_DIR/ambiguity.json"
    fi
    echo "<details><summary>Relatório do juiz de ambiguidade</summary>"
    echo
    cat "$RUN_DIR/ambiguity.md"
    echo
    echo "</details>"
  } > "$RUN_DIR/body.md"
else
  jq -n --arg err "$(tail -c 500 "$RUN_DIR/judge.stderr")" '{judge_exit: 2, score: null, error: $err}' > "$RUN_DIR/facts.json"
fi
