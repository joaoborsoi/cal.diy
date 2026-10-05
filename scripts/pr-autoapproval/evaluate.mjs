#!/usr/bin/env node
// Evaluates collected evidence against the PR auto-approval policy. Pure and
// deterministic: same evidence + same policy => byte-identical decision.
//
// Usage:
//   node scripts/pr-autoapproval/evaluate.mjs --evidence <file> [options]
//
// Options:
//   --evidence <file>  Evidence JSON from collect-evidence.mjs (required)
//   --policy <file>    Policy file (default: policy.json next to this script)
//   --out <file>       Decision JSON output (default: stdout)
//   --report <file>    Also write a Markdown report
//
// Exit codes: 0 = auto-approve, 1 = manual review, 2 = error

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DECISION, evaluate, renderReport } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));

try {
  const { values: args } = parseArgs({
    options: {
      evidence: { type: "string" },
      policy: { type: "string", default: join(here, "policy.json") },
      out: { type: "string" },
      report: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (args.help || !args.evidence) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 14)
        .join("\n")
        .replace(/^\/\/ ?/gm, "")
    );
    process.exit(args.help ? 0 : 2);
  }

  const evidence = JSON.parse(readFileSync(args.evidence, "utf8"));
  const policy = JSON.parse(readFileSync(args.policy, "utf8"));
  const result = evaluate(evidence, policy);

  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, json);
  else process.stdout.write(json);
  if (args.report) writeFileSync(args.report, renderReport(result));

  process.exit(result.decision === DECISION.APPROVE ? 0 : 1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
