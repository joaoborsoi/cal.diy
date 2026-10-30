#!/usr/bin/env bash
#
# Stage `auto-aprovacao`: the PR passed verificacao and the auto-approval
# policy (scripts/pr-autoapproval/policy.json), so no human review is needed.
# Take it out of draft, approve it and merge it — pinned to the commit that
# verificacao measured (state.verified_sha). Every step is re-read from the API
# and recorded as a fact; any gap sends the issue back to the human review gate.
#
# Usage: scripts/delivery-harness/stages/auto-aprovacao.sh <issue> <run-dir> <state-dir>
# Env: GITHUB_REPOSITORY, GH_TOKEN (workflow token: ready + merge),
#      HARNESS_APPROVER_TOKEN (token of an account other than the PR author — GitHub
#      rejects approving your own PR, and the harness opens PRs as github-actions[bot]),
#      HARNESS_MERGE_METHOD (squash | merge | rebase; default squash)

set -uo pipefail
ISSUE="$1" RUN_DIR="$2" STATE_DIR="$3"
PR="$(jq -r '.pr // empty' "$STATE_DIR/state.json")"
SHA="$(jq -r '.verified_sha // empty' "$STATE_DIR/state.json")"
BRANCH="$(jq -r .branch "$STATE_DIR/state.json")"
METHOD="${HARNESS_MERGE_METHOD:-squash}"
REPO="$GITHUB_REPOSITORY"
mkdir -p "$RUN_DIR"

pr_json() { gh api "repos/$REPO/pulls/$PR"; }
# GitHub's error message from a failed `gh api` call, or the raw tail of its log.
err_of() { local m; m="$(jq -r '.message // empty' "$1" 2>/dev/null)"; echo "${m:-$(tail -c 300 "$1")}"; }
F_UNCHANGED=false F_READY=false F_APPROVED=false F_MERGED=false
READY_ERR="" APPROVE_ERR="" MERGE_ERR="" APPROVED_BY="" MERGE_SHA=""

write_facts() {
  jq -n --argjson unchanged "$F_UNCHANGED" --argjson ready "$F_READY" --argjson approved "$F_APPROVED" \
    --argjson merged "$F_MERGED" --arg sha "$SHA" --arg ready_err "$READY_ERR" --arg approve_err "$APPROVE_ERR" \
    --arg merge_err "$MERGE_ERR" --arg by "$APPROVED_BY" --arg merge_sha "$MERGE_SHA" '
    def nz: if . == "" then null else . end;
    {head_unchanged: $unchanged, head_sha: ($sha | nz), ready: $ready, ready_error: ($ready_err | nz),
     approved: $approved, approved_by: ($by | nz), approve_error: ($approve_err | nz),
     merged: $merged, merge_sha: ($merge_sha | nz), merge_error: ($merge_err | nz)}' > "$RUN_DIR/facts.json"
  {
    if [[ "$F_MERGED" == true ]]; then
      echo "PR #$PR atendeu à política de auto-aprovação, foi aprovado por @$APPROVED_BY e mergeado (\`$METHOD\`, ${MERGE_SHA:0:12}) sem revisão humana."
    else
      echo "A aprovação automática não foi concluída; o PR #$PR volta para revisão humana."
    fi
  } > "$RUN_DIR/body.md"
  exit 0
}

[[ -n "$PR" && -n "$SHA" ]] || { READY_ERR="estado sem PR ou commit verificado"; write_facts; }

# 1. Nothing new was pushed since verificacao measured the PR.
read -r HEAD STATE < <(pr_json | jq -r '"\(.head.sha) \(.state)"')
[[ "$HEAD" == "$SHA" && "$STATE" == "open" ]] && F_UNCHANGED=true
[[ "$F_UNCHANGED" == true ]] || { READY_ERR="PR mudou (head ${HEAD:0:12}, estado $STATE)"; write_facts; }

# 2. Out of draft (REST can't do it; `gh pr ready` uses GraphQL).
gh pr ready "$PR" --repo "$REPO" > "$RUN_DIR/ready.log" 2>&1 || READY_ERR="$(tail -c 300 "$RUN_DIR/ready.log")"
[[ "$(pr_json | jq -r .draft)" == "false" ]] && F_READY=true

# 3. Approve the verified commit, as an identity other than the PR author.
if [[ -z "${HARNESS_APPROVER_TOKEN:-}" ]]; then
  APPROVE_ERR="secret HARNESS_APPROVER_TOKEN não configurado (o autor do PR não pode aprová-lo)"
else
  BODY="Auto-aprovado pelo harness de entrega: verificações verdes e política \`scripts/pr-autoapproval/policy.json\` atendida no commit $SHA (issue #$ISSUE)."
  GH_TOKEN="$HARNESS_APPROVER_TOKEN" gh api -X POST "repos/$REPO/pulls/$PR/reviews" \
    -f commit_id="$SHA" -f event=APPROVE -f body="$BODY" > "$RUN_DIR/approve.log" 2>&1 \
    || APPROVE_ERR="$(err_of "$RUN_DIR/approve.log")"
  APPROVED_BY="$(gh api --paginate "repos/$REPO/pulls/$PR/reviews" | jq -rs --arg sha "$SHA" \
    '[.[][] | select(.state == "APPROVED" and .commit_id == $sha)] | last | .user.login // empty')"
  [[ -n "$APPROVED_BY" ]] && F_APPROVED=true
fi

# 4. Merge only an approved, ready PR — and only if its head is still the verified commit.
if [[ "$F_APPROVED" == true && "$F_READY" == true ]]; then
  gh api -X PUT "repos/$REPO/pulls/$PR/merge" -f sha="$SHA" -f merge_method="$METHOD" \
    -f commit_title="$(pr_json | jq -r .title) (#$PR)" > "$RUN_DIR/merge.log" 2>&1 \
    || MERGE_ERR="$(err_of "$RUN_DIR/merge.log")"
  read -r MERGED MERGE_SHA < <(pr_json | jq -r '"\(.merged) \(.merge_commit_sha // "")"')
  if [[ "$MERGED" == "true" ]]; then
    F_MERGED=true
    gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" > /dev/null 2>&1 || true
  else
    MERGE_SHA=""
  fi
else
  MERGE_ERR="não tentado: o PR precisa estar aprovado e fora de rascunho"
fi

write_facts
