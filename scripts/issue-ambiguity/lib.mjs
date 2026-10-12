// Pure, deterministic core of the issue-ambiguity scorer.
// The LLM judge (judge.mjs) only produces a structured judgment; everything
// here — validation, the rule floor from the rubric, aggregation of samples
// and the resulting action — is plain code with no I/O, so it can be tested
// and audited. Rubric: .claude/skills/resolve-issue/ambiguity-rubric.md

import { createHash } from "node:crypto";

export const STATUSES = ["clear", "inferable", "missing"];
export const REPRO_STATUSES = [...STATUSES, "n/a"];
export const KINDS = ["bug", "feature", "refactor", "docs", "question", "discussion", "other"];
export const ACTION = {
  PROCEED: "proceed",
  ASSUME: "proceed_with_assumptions",
  CLARIFY: "needs_clarification",
};

// JSON Schema enforced on the judge's structured output (claude --json-schema).
export const JUDGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: KINDS },
    dimensions: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem: { type: "string", enum: STATUSES },
        expected: { type: "string", enum: STATUSES },
        location: { type: "string", enum: STATUSES },
        repro: { type: "string", enum: REPRO_STATUSES },
      },
      required: ["problem", "expected", "location", "repro"],
    },
    dimension_notes: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem: { type: "string" },
        expected: { type: "string" },
        location: { type: "string" },
        repro: { type: "string" },
      },
    },
    open_decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          has_safe_default: { type: "boolean" },
          default: { type: "string" },
        },
        required: ["question", "has_safe_default"],
      },
    },
    score: { type: "integer", minimum: 0, maximum: 3 },
    rationale: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    suggested_rewrite: { type: "string" },
  },
  required: ["kind", "dimensions", "open_decisions", "score", "rationale", "questions"],
};

// --- validation --------------------------------------------------------------

export function validateJudgment(j) {
  const errors = [];
  if (!j || typeof j !== "object") return ["judgment is not an object"];
  if (!KINDS.includes(j.kind)) errors.push(`kind must be one of ${KINDS.join("|")}`);
  const d = j.dimensions;
  if (!d || typeof d !== "object") {
    errors.push("dimensions must be an object");
  } else {
    for (const key of ["problem", "expected", "location"])
      if (!STATUSES.includes(d[key])) errors.push(`dimensions.${key} must be one of ${STATUSES.join("|")}`);
    if (!REPRO_STATUSES.includes(d.repro))
      errors.push(`dimensions.repro must be one of ${REPRO_STATUSES.join("|")}`);
  }
  if (!Array.isArray(j.open_decisions)) {
    errors.push("open_decisions must be an array");
  } else {
    j.open_decisions.forEach((o, i) => {
      if (typeof o?.question !== "string" || !o.question.trim())
        errors.push(`open_decisions[${i}].question must be a non-empty string`);
      if (typeof o?.has_safe_default !== "boolean")
        errors.push(`open_decisions[${i}].has_safe_default must be a boolean`);
    });
  }
  if (!Number.isInteger(j.score) || j.score < 0 || j.score > 3) errors.push("score must be an integer 0..3");
  if (typeof j.rationale !== "string") errors.push("rationale must be a string");
  if (!Array.isArray(j.questions) || j.questions.some((q) => typeof q !== "string"))
    errors.push("questions must be an array of strings");
  return errors;
}

// --- scoring -----------------------------------------------------------------

const blocking = (j) => j.open_decisions.filter((o) => !o.has_safe_default);

// Minimum score implied by the rubric's "Scoring rules" table.
export function ruleFloor(j) {
  const { problem, expected, location, repro } = j.dimensions;
  const nBlocking = blocking(j).length;
  const nAssumed = j.open_decisions.length - nBlocking;
  const rules = [
    [problem === "missing", 3, "D1 (problem) missing"],
    [nBlocking >= 3, 3, `${nBlocking} blocking open decisions (>= 3)`],
    [expected === "missing", 2, "D2 (expected behavior) missing"],
    [repro === "missing", 2, "D4 (repro/evidence) missing"],
    [nBlocking >= 1, 2, `${nBlocking} blocking open decision(s)`],
    [location === "missing", 1, "D3 (location) missing"],
    [[problem, expected, location, repro].includes("inferable"), 1, "some dimension is only inferable"],
    [nAssumed >= 1, 1, `${nAssumed} decision(s) settled by an assumed default`],
  ];
  const hits = rules.filter(([when]) => when).map(([, floor, reason]) => ({ floor, reason }));
  return { floor: Math.max(0, ...hits.map((h) => h.floor)), reasons: hits.map((h) => `${h.reason} → ≥${h.floor}`) };
}

export function scoreJudgment(j) {
  const { floor, reasons } = ruleFloor(j);
  const score = Math.max(j.score, floor);
  return { score, judge_score: j.score, floor, floor_reasons: reasons, adjusted: score !== j.score };
}

// Median of the per-sample scores, rounding up between the two middle values
// (rubric: "when torn between two levels, pick the higher one").
export function aggregateScores(scores) {
  if (scores.length === 0) throw new Error("no scores to aggregate");
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return Number.isInteger(mid) ? Math.max(sorted[mid - 1], sorted[mid]) : sorted[Math.floor(mid)];
}

export function actionFor(score) {
  if (score === 0) return ACTION.PROCEED;
  if (score === 1) return ACTION.ASSUME;
  return ACTION.CLARIFY;
}

export function assumptionsOf(j) {
  return j.open_decisions
    .filter((o) => o.has_safe_default)
    .map((o) => (o.default ? `${o.question} → ${o.default}` : o.question));
}

// --- decision ----------------------------------------------------------------

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// samples: [{ judgment, cost_usd? }] — already validated.
export function decide({ subject, samples, rubricText, issueText, model = null }) {
  if (samples.length === 0) throw new Error("no valid samples");
  const scored = samples.map((s) => ({ ...s, ...scoreJudgment(s.judgment) }));
  const score = aggregateScores(scored.map((s) => s.score));
  // The representative sample is the first one that landed on the final score;
  // its questions/assumptions are what the human (or agent) acts on.
  const rep = scored.find((s) => s.score === score);
  const action = actionFor(score);
  const scores = scored.map((s) => s.score);
  return {
    subject,
    score,
    action,
    failure_reason:
      action !== ACTION.CLARIFY ? null : ["question", "discussion"].includes(rep.judgment.kind) ? "not_actionable" : "needs_clarification",
    kind: rep.judgment.kind,
    dimensions: rep.judgment.dimensions,
    dimension_notes: rep.judgment.dimension_notes ?? {},
    open_decisions: rep.judgment.open_decisions,
    assumptions: assumptionsOf(rep.judgment),
    questions: rep.judgment.questions,
    suggested_rewrite: rep.judgment.suggested_rewrite ?? null,
    rationale: rep.judgment.rationale,
    floor_reasons: rep.floor_reasons,
    samples: scored.map((s) => ({ score: s.score, judge_score: s.judge_score, floor: s.floor, adjusted: s.adjusted, cost_usd: s.cost_usd ?? null })),
    agreement: { min: Math.min(...scores), max: Math.max(...scores), unanimous: new Set(scores).size === 1 },
    model,
    rubric_sha256: sha256(rubricText),
    issue_sha256: sha256(issueText),
  };
}

// --- report ------------------------------------------------------------------

const LABEL = ["not ambiguous", "low ambiguity", "moderate ambiguity", "high ambiguity"];

export function renderReport(d) {
  const lines = [
    `# Ambiguity: ${d.score}/3 (${LABEL[d.score]}) — ${d.action}`,
    "",
    `- Issue: ${d.subject}`,
    `- Kind: ${d.kind}`,
    `- Samples: ${d.samples.map((s) => s.score).join(", ")}${d.agreement.unanimous ? " (unanimous)" : " (divergent — review)"}`,
    "",
    "## Dimensions",
    "",
    "| Dimension | Status | Note |",
    "|---|---|---|",
    ...["problem", "expected", "location", "repro"].map(
      (k) => `| ${k} | ${d.dimensions[k]} | ${(d.dimension_notes[k] ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`
    ),
    "",
    "## Rationale",
    "",
    d.rationale,
  ];
  if (d.floor_reasons.length)
    lines.push("", "## Rules applied (floor)", "", ...d.floor_reasons.map((r) => `- ${r}`));
  if (d.questions.length && d.action === ACTION.CLARIFY)
    lines.push("", "## Questions for the author", "", ...d.questions.map((q) => `- ${q}`));
  if (d.assumptions.length) lines.push("", "## Assumptions (safe defaults)", "", ...d.assumptions.map((a) => `- ${a}`));
  if (d.suggested_rewrite && d.action === ACTION.CLARIFY)
    lines.push("", "## Suggested rewrite", "", d.suggested_rewrite);
  return `${lines.join("\n")}\n`;
}
