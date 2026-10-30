#!/usr/bin/env node
// Step 1 of every harness run: read the event, load the issue's state, apply a
// human command or the trigger label, persist the result and tell the workflow
// which stage job (if any) to run.
//
// Usage (in GitHub Actions): node scripts/delivery-harness/route.mjs --out-dir <dir>
// Writes <dir>/state.json and <dir>/feedback.md, and GITHUB_OUTPUT keys:
//   issue, stage (triagem|planejamento|implementacao|verificacao|""), branch, pr, plan_comment_id

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { api, comment, ensureLabels, loadPanel, markReady, savePanel, syncStateLabel } from "./github.mjs";
import { parseCommand, route } from "./lib.mjs";

const { values: opts } = parseArgs({ options: { "out-dir": { type: "string", default: ".harness/state" } } });
const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const eventName = process.env.GITHUB_EVENT_NAME;
const now = new Date().toISOString();

let issue;
let event;
if (eventName === "issues") {
  issue = payload.issue.number;
  event = { name: "labeled", label: payload.label?.name, actor: payload.sender.login };
} else if (eventName === "issue_comment") {
  issue = payload.issue.number;
  const command = parseCommand(payload.comment.body);
  event = command
    ? {
        name: "command",
        command,
        actor: payload.comment.user.login,
        association: payload.comment.author_association,
      }
    : { name: "dispatch" };
} else if (eventName === "workflow_dispatch") {
  issue = Number(payload.inputs.issue);
  event = { name: "dispatch" };
} else {
  throw new Error(`unsupported event ${eventName}`);
}

ensureLabels();
const panel = loadPanel(issue);
const decision = route(panel.state, event, { issue, now });

if (decision.reply) {
  comment(issue, `> ${payload.comment?.body?.split("\n")[0] ?? ""}\n\n${decision.reply}`);
  if (payload.comment)
    api("POST", `issues/comments/${payload.comment.id}/reactions`, { content: "confused" });
}

let state = decision.state;
if (decision.changed) {
  if (payload.comment) api("POST", `issues/comments/${payload.comment.id}/reactions`, { content: "+1" });
  // Leaving the review gate with /aprovar hands the draft PR over to humans.
  if (state.state === "concluido" && state.pr) {
    markReady(state.pr);
    comment(
      issue,
      `✅ Aprovado por @${event.actor}. O PR #${state.pr} saiu de rascunho e está pronto para revisão/merge.`
    );
  }
  panel.id = savePanel(issue, panel.id, state);
  syncStateLabel(issue, state.state);
}

mkdirSync(opts["out-dir"], { recursive: true });
writeFileSync(`${opts["out-dir"]}/state.json`, `${JSON.stringify(state ?? null, null, 2)}\n`);
writeFileSync(`${opts["out-dir"]}/feedback.md`, state?.feedback ?? "");

const outputs = {
  issue,
  stage: decision.stage ?? "",
  branch: state?.branch ?? "",
  pr: state?.pr ?? "",
  plan_comment_id: state?.plan_comment_id ?? "",
};
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([k, v]) => `${k}=${v}\n`)
      .join("")
  );
}
console.log(
  `issue #${issue}: ${event.name} → state ${state?.state ?? "(none)"}, stage ${decision.stage ?? "none"}`
);
