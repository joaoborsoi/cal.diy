// Run with: node --test scripts/pr-autoapproval/lib.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyFile, DECISION, evaluate, findContentMarkers, matchesGlob, sha256 } from "./lib.mjs";

const policy = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8"));

const file = (path, additions, deletions, extra = {}) => ({
  path,
  status: "M",
  additions,
  deletions,
  binary: false,
  content_markers: [],
  ...extra,
});
const evidenceOf = (...files) => ({ subject: { source: "local" }, files });

test("glob matching", () => {
  assert.ok(matchesGlob("packages/ui/components/button/Button.tsx", "packages/ui/**"));
  assert.ok(matchesGlob("styles.css", "**/*.{css,scss}"));
  assert.ok(matchesGlob("apps/web/styles/a.scss", "**/*.{css,scss}"));
  assert.ok(matchesGlob("apps/web/app/api/x/route.ts", "**/api/**"));
  assert.ok(matchesGlob("packages/features/bookings/components/A.tsx", "packages/features/**/components/**"));
  assert.ok(!matchesGlob("packages/uix/a.ts", "packages/ui/**"));
  assert.ok(!matchesGlob("apps/web/a.tsx", "*.tsx"), "patterns are anchored at the repo root");
  assert.ok(!matchesGlob("a.cssx", "**/*.{css,scss}"));
});

test("classification order: markers > exclude > include > default", () => {
  assert.deepEqual(classifyFile(file("packages/ui/form/Input.tsx", 1, 0), policy), {
    frontend: true,
    rule: "include:packages/ui/**",
  });
  assert.equal(classifyFile(file("packages/ui/package.json", 1, 0), policy).rule, "exclude:**/package.json");
  assert.equal(
    classifyFile(file("packages/features/bookings/components/server/x.tsx", 1, 0), policy).frontend,
    false
  );
  assert.equal(classifyFile(file("packages/lib/date.ts", 1, 0), policy).rule, "default:no-include-matched");
  const marked = file("apps/web/modules/actions.ts", 1, 0, {
    content_markers: [policy.classification.backend_content_markers[0]],
  });
  assert.match(classifyFile(marked, policy).rule, /^content-marker:/);
});

test("content markers detect server code", () => {
  assert.equal(findContentMarkers('"use server";\nexport async function a() {}', policy).length, 1);
  assert.equal(findContentMarkers("import 'server-only';", policy).length, 1);
  assert.equal(findContentMarkers('"use client";\nconst s = "use server";', policy).length, 0);
});

test("small frontend change is auto-approved", () => {
  const r = evaluate(
    evidenceOf(file("apps/web/modules/bookings/List.tsx", 20, 10), file("packages/ui/styles.css", 5, 0)),
    policy
  );
  assert.equal(r.decision, DECISION.APPROVE);
  assert.equal(r.totals.changed_lines, 35);
});

test("exactly 50 lines passes, 51 does not", () => {
  assert.equal(evaluate(evidenceOf(file("packages/ui/a.tsx", 25, 25)), policy).decision, DECISION.APPROVE);
  const r = evaluate(evidenceOf(file("packages/ui/a.tsx", 26, 25)), policy);
  assert.equal(r.decision, DECISION.MANUAL);
  assert.equal(r.checks.find((c) => c.id === "max-changed-lines").passed, false);
});

test("any non-frontend file requires manual review", () => {
  const r = evaluate(
    evidenceOf(file("packages/ui/a.tsx", 1, 0), file("packages/prisma/schema.prisma", 1, 0)),
    policy
  );
  assert.equal(r.decision, DECISION.MANUAL);
  assert.equal(r.checks.find((c) => c.id === "frontend-only").passed, false);
});

test("binary files and empty diffs require manual review", () => {
  const bin = file("apps/web/public/logo.png", null, null, { binary: true });
  assert.equal(evaluate(evidenceOf(bin), policy).decision, DECISION.MANUAL);
  assert.equal(evaluate(evidenceOf(), policy).decision, DECISION.MANUAL);
});

test("deterministic: same input, same output regardless of file order", () => {
  const a = file("packages/ui/a.tsx", 1, 1);
  const b = file("packages/ui/b.tsx", 2, 2);
  const r1 = evaluate(evidenceOf(a, b), policy);
  const r2 = evaluate(evidenceOf(a, b), policy);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  assert.deepEqual(evaluate(evidenceOf(b, a), policy).files, r1.files);
});

test("rejects evidence collected with another policy", () => {
  const changed = { ...policy, max_changed_lines: 1000 };
  const ev = { ...evidenceOf(file("packages/ui/a.tsx", 1, 0)), policy_sha256: sha256(policy) };
  assert.equal(evaluate(ev, policy).decision, DECISION.APPROVE);
  assert.throws(() => evaluate(ev, changed), /different policy/);
});
