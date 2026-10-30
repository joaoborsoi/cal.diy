#!/usr/bin/env bash
#
# Stage `verificacao`: deterministic checks on the harness branch — no LLM.
# Lint, tests and type-check scoped to what the PR touched, a "tests come with
# code" rule, and the auto-approval policy. A green PR that meets the policy
# goes to `auto-aprovacao` (approve + merge) instead of the human review gate;
# the facts pin the commit that was checked and the one the policy measured.
#
# Usage: scripts/delivery-harness/stages/verificacao.sh <issue> <run-dir> <state-dir>
# Env: GITHUB_REPOSITORY, GH_TOKEN, GITHUB_TOKEN
# Assumes the branch is checked out and dependencies are installed.

set -uo pipefail
ISSUE="$1" RUN_DIR="$2" STATE_DIR="$3"
# Tooling comes from HARNESS_HOME (a copy taken from the base branch before any
# agent branch is checked out), so code on the agent branch never replaces it.
ROOT="${HARNESS_HOME:-$(git rev-parse --show-toplevel)}"
PR="$(jq -r '.pr // empty' "$STATE_DIR/state.json")"
mkdir -p "$RUN_DIR/logs"
: > "$RUN_DIR/checks.jsonl"
HEAD_SHA="$(git rev-parse HEAD)"
AUTO_DECISION="error"

record() { # name result command notes
  jq -nc --arg name "$1" --arg result "$2" --arg command "$3" --arg notes "$4" \
    '{name:$name, result:$result, command:$command, notes:(if $notes == "" then null else $notes end)}' >> "$RUN_DIR/checks.jsonl"
}
finish() {
  jq -s --arg head "$HEAD_SHA" --arg decision "$AUTO_DECISION" \
    --arg policy_head "$(jq -r '.subject.head_sha // empty' "$RUN_DIR/autoapproval/evidence.json" 2>/dev/null)" \
    '{checks: ., head_sha: $head, autoapproval: {decision: $decision, head_sha: (if $policy_head == "" then null else $policy_head end)}}' \
    "$RUN_DIR/checks.jsonl" > "$RUN_DIR/facts.json"
  {
    for log in "$RUN_DIR"/logs/*.log; do
      [[ -s "$log" ]] || continue
      echo "<details><summary>log: $(basename "$log" .log)</summary>"; echo; echo '```'; tail -n 60 "$log"; echo '```'; echo "</details>"; echo
    done
    [[ -s "$RUN_DIR/autoapproval/report.md" ]] && { echo "<details><summary>Política de auto-aprovação</summary>"; echo; cat "$RUN_DIR/autoapproval/report.md"; echo "</details>"; }
  } > "$RUN_DIR/body.md"
  exit 0
}
# Run a check; on failure the tail of its log becomes the note the agent gets back.
run_check() { # name command...
  local name="$1"; shift
  local log="$RUN_DIR/logs/$name.log"
  # Code under test came from the agent: run it without GitHub credentials.
  if env -u GH_TOKEN -u GITHUB_TOKEN timeout 1500 "$@" > "$log" 2>&1; then
    record "$name" pass "$*" ""
    : > "$log"
  else
    record "$name" fail "$*" "$(tail -n 25 "$log" | tail -c 1500)"
  fi
}

if [[ -z "$PR" ]]; then record "PR aberto" fail "" "nenhum PR registrado no estado"; finish; fi
mapfile -t CHANGED < <(gh pr diff "$PR" --repo "$GITHUB_REPOSITORY" --name-only)
mapfile -t EXISTING < <(for f in "${CHANGED[@]}"; do [[ -f "$f" ]] && echo "$f"; done)
record "PR aberto" pass "gh pr diff $PR --name-only" "${#CHANGED[@]} arquivo(s)"

mapfile -t TESTS < <(printf '%s\n' "${EXISTING[@]}" | grep -E '\.(test|spec)\.(ts|tsx|js|mjs)$' | grep -vE '(^|/)(playwright|e2e)/|\.e2e\.')
mapfile -t LOGIC < <(printf '%s\n' "${EXISTING[@]}" | grep -E '^(apps|packages)/.*\.ts$' | grep -vE '\.(test|spec|d)\.ts$')
mapfile -t CODE < <(printf '%s\n' "${EXISTING[@]}" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$')

# 1. Logic changes must come with tests.
if [[ ${#LOGIC[@]} -gt 0 && ${#TESTS[@]} -eq 0 ]]; then
  record "testes acompanham a lógica" fail "" "arquivos .ts alterados sem nenhum teste novo/alterado: ${LOGIC[*]}"
else
  record "testes acompanham a lógica" pass "" "${#TESTS[@]} arquivo(s) de teste"
fi

# 2. Lint (biome) on the changed files.
if [[ ${#CODE[@]} -gt 0 ]]; then
  run_check "lint" yarn biome lint --no-errors-on-unmatched --files-ignore-unknown=true "${CODE[@]}"
else
  record "lint" skipped "" "nenhum arquivo de código alterado"
fi

# 3. Unit tests that the PR touched.
if [[ ${#TESTS[@]} -gt 0 ]]; then
  run_check "testes" env TZ=UTC yarn vitest run "${TESTS[@]}"
else
  record "testes" skipped "" "nenhum teste alterado"
fi

# 4. Type-check the workspaces that own the changed files.
mapfile -t PKGS < <(for f in "${CODE[@]}"; do
  d="$(dirname "$f")"
  while [[ "$d" != "." && ! -f "$d/package.json" ]]; do d="$(dirname "$d")"; done
  [[ -f "$d/package.json" ]] && jq -r 'select(.scripts["type-check"]) | .name' "$d/package.json"
done | sort -u)
if [[ ${#PKGS[@]} -gt 0 ]]; then
  run_check "type-check" yarn turbo run type-check "${PKGS[@]/#/--filter=}"
else
  record "type-check" skipped "" "nenhum workspace com type-check afetado"
fi

# 5. Auto-approval policy — never fails the stage; it decides whether a human
#    still has to review (manual) or the harness approves and merges (eligible).
"$ROOT/scripts/pr-autoapproval/check.sh" "$PR" --repo "$GITHUB_REPOSITORY" --out-dir "$RUN_DIR/autoapproval" > "$RUN_DIR/logs/autoapproval.out" 2>&1
case $? in
  0) AUTO_DECISION="auto-approve"
     record "política de auto-aprovação" info "scripts/pr-autoapproval/check.sh $PR" "elegível: aprovação e merge automáticos" ;;
  1) AUTO_DECISION="manual-review"
     record "política de auto-aprovação" info "scripts/pr-autoapproval/check.sh $PR" "não elegível: requer revisão humana" ;;
  *) record "política de auto-aprovação" skipped "scripts/pr-autoapproval/check.sh $PR" "controle não executou" ;;
esac
: > "$RUN_DIR/logs/autoapproval.out"

finish
