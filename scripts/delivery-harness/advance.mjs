#!/usr/bin/env node
// Last step of every stage job: check the stage's exit conditions against the
// facts the job collected, record the result on the issue, move the state and,
// if the next state is automatic, dispatch the workflow again.
//
// Usage:
//   node scripts/delivery-harness/advance.mjs --issue <n> --stage <stage> --facts <facts.json>
//     [--body <extra.md>]   Markdown appended to the stage comment (plan, report…)
//
// Env: HARNESS_MAX_ATTEMPTS, HARNESS_MAX_CHANGED_LINES, HARNESS_MAX_CHANGED_FILES

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { comment, dispatchNext, loadPanel, runUrl, savePanel, syncStateLabel } from "./github.mjs";
import { AUTO_STAGES, DEFAULT_LIMITS, evaluateStage, isAuto, renderStageComment } from "./lib.mjs";

const { values: opts } = parseArgs({
  options: {
    issue: { type: "string" },
    stage: { type: "string" },
    facts: { type: "string" },
    body: { type: "string" },
  },
});
if (!opts.issue || !AUTO_STAGES.includes(opts.stage) || !opts.facts) {
  console.error("usage: advance.mjs --issue <n> --stage <stage> --facts <facts.json> [--body <file>]");
  process.exit(2);
}

const issue = Number(opts.issue);
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
const facts = readJson(opts.facts);
const body = opts.body && existsSync(opts.body) ? readFileSync(opts.body, "utf8") : "";
const limits = {
  maxAttempts: Number(process.env.HARNESS_MAX_ATTEMPTS || DEFAULT_LIMITS.maxAttempts),
  maxChangedLines: Number(process.env.HARNESS_MAX_CHANGED_LINES || DEFAULT_LIMITS.maxChangedLines),
  maxChangedFiles: Number(process.env.HARNESS_MAX_CHANGED_FILES || DEFAULT_LIMITS.maxChangedFiles),
};

// Re-read the state: a human may have cancelled while the stage was running.
const panel = loadPanel(issue);
const result = evaluateStage(panel.state, opts.stage, facts, {
  now: new Date().toISOString(),
  limits,
  runUrl: runUrl(),
});

if (result.stale) {
  comment(
    issue,
    `ℹ️ A etapa \`${opts.stage}\` terminou, mas a issue já está em \`${panel.state?.state}\`; resultado descartado. ${runUrl() ?? ""}`
  );
  process.exit(0);
}

let { state } = result;
const posted = comment(
  issue,
  renderStageComment({ stage: opts.stage, outcome: result.outcome, state, runUrl: runUrl(), body })
);
// The approved plan is the comment that carried it; implementation reads it back from there.
if (opts.stage === "planejamento" && state.state === "aguardando-plano")
  state = { ...state, plan_comment_id: posted.id };

savePanel(issue, panel.id, state);
syncStateLabel(issue, state.state);
console.log(
  `issue #${issue}: ${opts.stage} → ${state.state}${result.outcome.error ? ` (${result.outcome.error})` : ""}`
);

if (isAuto(state.state)) dispatchNext(issue);
