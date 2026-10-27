// Run with: node --test scripts/issue-ambiguity/lib.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION,
  aggregateScores,
  decide,
  renderReport,
  ruleFloor,
  scoreJudgment,
  validateJudgment,
} from "./lib.mjs";

const judgment = ({ dimensions, ...overrides } = {}) => ({
  kind: "bug",
  dimensions: { problem: "clear", expected: "clear", location: "clear", repro: "clear", ...dimensions },
  open_decisions: [],
  score: 0,
  rationale: "ok",
  questions: [],
  ...overrides,
});
const decision = (question, has_safe_default, def) => ({ question, has_safe_default, ...(def ? { default: def } : {}) });

test("validation accepts a well-formed judgment and rejects bad fields", () => {
  assert.deepEqual(validateJudgment(judgment()), []);
  assert.ok(validateJudgment(judgment({ score: 4 })).some((e) => e.startsWith("score")));
  assert.ok(validateJudgment(judgment({ dimensions: { repro: "maybe" } })).some((e) => e.includes("repro")));
  assert.ok(validateJudgment(judgment({ dimensions: { problem: "n/a" } })).some((e) => e.includes("problem")));
  assert.ok(validateJudgment(judgment({ open_decisions: [{ question: "x" }] })).some((e) => e.includes("has_safe_default")));
  assert.ok(validateJudgment(null).length > 0);
});

test("fully clear issue has floor 0", () => {
  assert.deepEqual(ruleFloor(judgment()), { floor: 0, reasons: [] });
  assert.equal(ruleFloor(judgment({ dimensions: { repro: "n/a" } })).floor, 0);
});

test("rule floor follows the rubric table", () => {
  const floor = (o) => ruleFloor(judgment(o)).floor;
  assert.equal(floor({ dimensions: { problem: "missing" } }), 3);
  assert.equal(floor({ open_decisions: [decision("a", false), decision("b", false), decision("c", false)] }), 3);
  assert.equal(floor({ dimensions: { expected: "missing" } }), 2);
  assert.equal(floor({ dimensions: { repro: "missing" } }), 2);
  assert.equal(floor({ open_decisions: [decision("a", false)] }), 2);
  assert.equal(floor({ dimensions: { location: "missing" } }), 1);
  assert.equal(floor({ dimensions: { location: "inferable" } }), 1);
  assert.equal(floor({ open_decisions: [decision("a", true, "x")] }), 1);
  // decisions with a safe default never block, however many there are
  assert.equal(floor({ open_decisions: [decision("a", true), decision("b", true), decision("c", true)] }), 1);
});

test("final score is max(judge, floor) and flags adjustments", () => {
  const raised = scoreJudgment(judgment({ score: 1, dimensions: { expected: "missing" } }));
  assert.equal(raised.score, 2);
  assert.equal(raised.adjusted, true);
  const kept = scoreJudgment(judgment({ score: 3, dimensions: { location: "inferable" } }));
  assert.equal(kept.score, 3, "the judge may be stricter than the floor");
  assert.equal(kept.adjusted, false);
});

test("aggregation is the median, rounding up between the middle values", () => {
  assert.equal(aggregateScores([2]), 2);
  assert.equal(aggregateScores([0, 3, 1]), 1);
  assert.equal(aggregateScores([1, 2]), 2);
  assert.equal(aggregateScores([0, 0, 2, 3]), 2);
  assert.throws(() => aggregateScores([]));
});

test("decide maps score to action and picks a representative sample", () => {
  const rubricText = "rubric";
  const issueText = "issue";
  const ok = decide({
    subject: "o/r#1",
    samples: [{ judgment: judgment({ score: 1, open_decisions: [decision("Which toast?", true, "the existing one")] }) }],
    rubricText,
    issueText,
  });
  assert.equal(ok.score, 1);
  assert.equal(ok.action, ACTION.ASSUME);
  assert.equal(ok.failure_reason, null);
  assert.deepEqual(ok.assumptions, ["Which toast? → the existing one"]);

  const vague = decide({
    subject: "o/r#2",
    samples: [
      { judgment: judgment({ score: 1 }) },
      { judgment: judgment({ score: 2, kind: "feature", dimensions: { expected: "missing" }, questions: ["Q?"] }) },
      { judgment: judgment({ score: 3, kind: "question", dimensions: { problem: "missing" } }) },
    ],
    rubricText,
    issueText,
  });
  assert.equal(vague.score, 2);
  assert.equal(vague.action, ACTION.CLARIFY);
  assert.equal(vague.failure_reason, "needs_clarification");
  assert.deepEqual(vague.questions, ["Q?"]);
  assert.deepEqual(vague.agreement, { min: 1, max: 3, unanimous: false });
  assert.match(renderReport(vague), /Questions for the author[\s\S]*- Q\?/);

  const question = decide({
    subject: "o/r#3",
    samples: [{ judgment: judgment({ score: 3, kind: "question", dimensions: { problem: "missing" } }) }],
    rubricText,
    issueText,
  });
  assert.equal(question.failure_reason, "not_actionable");
});
