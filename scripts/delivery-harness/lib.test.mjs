// Run with: node --test scripts/delivery-harness/lib.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCommand,
  DEFAULT_LIMITS,
  evaluateStage,
  initialState,
  missingPlanSections,
  parseCommand,
  parsePanel,
  renderPanel,
  renderStageComment,
  route,
} from "./lib.mjs";

const now = "2026-10-27T12:00:00.000Z";
const ctx = { issue: 7, now };
const at = (state, overrides = {}) => ({ ...initialState(7, now), state, ...overrides });
const cmd = (body, association = "OWNER") => ({
  name: "command",
  command: parseCommand(body),
  actor: "joao",
  association,
});
const okPlan = {
  agent_ok: true,
  status: "ready",
  plan_present: true,
  plan_missing_sections: [],
  repo_clean: true,
};
const okImpl = {
  agent_ok: true,
  status: "completed",
  new_commits: 2,
  repo_clean: true,
  pushed: true,
  pr_number: 42,
  changed_lines: 120,
  changed_files: 4,
};

test("parseCommand reads the command and the feedback text", () => {
  assert.deepEqual(parseCommand("/aprovar"), { name: "aprovar", text: "" });
  assert.deepEqual(parseCommand("  /Revisar use o hook existente\nsegunda linha"), {
    name: "revisar",
    text: "use o hook existente\nsegunda linha",
  });
  assert.equal(parseCommand("/aprovarr"), null);
  assert.equal(parseCommand("parece bom, /aprovar"), null);
  assert.equal(parseCommand("/deploy"), null);
});

test("the trigger label starts the machine at triagem, and only when idle", () => {
  const started = route(null, { name: "labeled", label: "priorizado", actor: "joao" }, ctx);
  assert.equal(started.state.state, "triagem");
  assert.equal(started.stage, "triagem");
  assert.equal(started.changed, true);

  const busy = at("aguardando-plano");
  const relabeled = route(busy, { name: "labeled", label: "priorizado", actor: "joao" }, ctx);
  assert.equal(relabeled.changed, false);
  assert.equal(relabeled.state.state, "aguardando-plano");

  const restarted = route(
    at("concluido", { history: [{ stage: "x" }] }),
    { name: "labeled", label: "priorizado" },
    ctx
  );
  assert.equal(restarted.state.state, "triagem");
  assert.equal(restarted.state.history.length, 2, "history of previous cycles is kept");

  assert.equal(route(null, { name: "labeled", label: "bug" }, ctx).state, null);
});

test("any event pumps an automatic state, so a lost dispatch is recovered", () => {
  assert.equal(route(at("implementacao"), { name: "dispatch" }, ctx).stage, "implementacao");
  assert.equal(route(at("aguardando-plano"), { name: "dispatch" }, ctx).stage, null);
});

test("human gates follow the transition table", () => {
  const cases = [
    ["aguardando-plano", "/aprovar", "implementacao"],
    ["aguardando-plano", "/revisar trocar a abordagem", "planejamento"],
    ["aguardando-esclarecimento", "/retomar", "triagem"],
    ["aguardando-esclarecimento", "/aprovar", "planejamento"],
    ["aguardando-escopo", "/aprovar", "verificacao"],
    ["aguardando-escopo", "/revisar dividir em dois PRs", "implementacao"],
    ["aguardando-revisao", "/aprovar", "concluido"],
    ["aguardando-revisao", "/revisar renomear a prop", "implementacao"],
    ["aguardando-revisao", "/cancelar", "cancelado"],
  ];
  for (const [from, body, to] of cases) {
    const r = route(at(from), cmd(body), ctx);
    assert.equal(r.state.state, to, `${from} ${body}`);
    assert.equal(r.reply, null);
  }
});

test("/revisar stores the feedback and resets the attempt budget", () => {
  const r = route(
    at("aguardando-plano", { attempts: { planejamento: 2 } }),
    cmd("/revisar usar o repositório existente"),
    ctx
  );
  assert.equal(r.state.feedback, "usar o repositório existente");
  assert.deepEqual(r.state.attempts, {});
  assert.equal(r.state.history.at(-1).by, "joao");
});

test("invalid or untrusted commands are rejected with an explanation", () => {
  assert.match(route(at("implementacao"), cmd("/aprovar"), ctx).reply, /em andamento/);
  assert.match(route(at("aguardando-plano"), cmd("/retomar"), ctx).reply, /comandos válidos/);
  assert.match(route(at("aguardando-plano"), cmd("/revisar"), ctx).reply, /precisa de um texto/);
  const outsider = route(at("aguardando-plano"), cmd("/aprovar", "NONE"), ctx);
  assert.match(outsider.reply, /apenas owners/);
  assert.equal(outsider.state.state, "aguardando-plano");
  assert.match(applyCommand(null, parseCommand("/aprovar"), { actor: "joao", now }).reply, /não está ativo/);
});

test("/retomar from bloqueado returns to the stage that blocked, keeping its feedback", () => {
  const r = route(
    at("bloqueado", { blocked_from: "implementacao", feedback: "lint falhou" }),
    cmd("/retomar"),
    ctx
  );
  assert.equal(r.state.state, "implementacao");
  assert.equal(r.state.feedback, "lint falhou");
  assert.equal(r.state.blocked_from, null);
});

test("triagem gate: score decides between planning and asking the author", () => {
  assert.equal(
    evaluateStage(at("triagem"), "triagem", { judge_exit: 0, score: 1 }, ctx).state.state,
    "planejamento"
  );
  assert.equal(
    evaluateStage(at("triagem"), "triagem", { judge_exit: 1, score: 2 }, ctx).state.state,
    "aguardando-esclarecimento"
  );
  const broken = evaluateStage(at("triagem"), "triagem", {}, ctx);
  assert.equal(broken.state.state, "triagem", "first failure retries");
  assert.equal(broken.outcome.retried, true);
});

test("planejamento gate requires a complete plan and an untouched repo", () => {
  assert.equal(
    evaluateStage(at("planejamento"), "planejamento", okPlan, ctx).state.state,
    "aguardando-plano"
  );
  const dirty = evaluateStage(
    at("planejamento"),
    "planejamento",
    { ...okPlan, repo_clean: false, dirty_files: ["a.ts"] },
    ctx
  );
  assert.equal(dirty.state.state, "planejamento");
  assert.ok(dirty.outcome.checks.some((c) => !c.pass && c.details === "a.ts"));
  const clarify = evaluateStage(
    at("planejamento"),
    "planejamento",
    { ...okPlan, status: "needs_clarification" },
    ctx
  );
  assert.equal(clarify.state.state, "aguardando-esclarecimento");
});

test("a stage that keeps failing blocks after the attempt budget", () => {
  const first = evaluateStage(at("planejamento"), "planejamento", { agent_ok: false }, ctx);
  assert.equal(first.state.state, "planejamento");
  const second = evaluateStage(first.state, "planejamento", { agent_ok: false }, ctx);
  assert.equal(second.state.state, "bloqueado");
  assert.equal(second.state.blocked_from, "planejamento");
});

test("implementacao gate: observed facts, then the size limit asks a human", () => {
  const ok = evaluateStage(at("implementacao"), "implementacao", okImpl, ctx);
  assert.equal(ok.state.state, "verificacao");
  assert.equal(ok.state.pr, 42);

  const noCommit = evaluateStage(at("implementacao"), "implementacao", { ...okImpl, new_commits: 0 }, ctx);
  assert.equal(noCommit.state.state, "implementacao", "agent said completed but git disagrees → retry");

  const big = evaluateStage(at("implementacao"), "implementacao", { ...okImpl, changed_lines: 900 }, ctx);
  assert.equal(big.state.state, "aguardando-escopo");
  const custom = evaluateStage(
    at("implementacao"),
    "implementacao",
    { ...okImpl, changed_lines: 900 },
    {
      ...ctx,
      limits: { maxAttempts: 2, maxChangedLines: 1000, maxChangedFiles: 10 },
    }
  );
  assert.equal(custom.state.state, "verificacao");
});

test("verificacao: failures go back to implementation with feedback, then block", () => {
  const checks = [
    { name: "lint", result: "pass" },
    { name: "testes", result: "fail", command: "yarn vitest run a.test.ts", notes: "expected 1 got 2" },
    { name: "política de auto-aprovação", result: "info" },
  ];
  const once = evaluateStage(
    at("verificacao", { attempts: { implementacao: 1 } }),
    "verificacao",
    { checks },
    ctx
  );
  assert.equal(once.state.state, "implementacao");
  assert.equal(once.state.history.at(-1).result, "reprovado, volta ao agente");
  assert.match(once.state.feedback, /testes .*yarn vitest run a\.test\.ts.*expected 1 got 2/);

  const twice = evaluateStage(
    at("verificacao", { attempts: { implementacao: 2 } }),
    "verificacao",
    { checks },
    ctx
  );
  assert.equal(twice.state.state, "bloqueado");
  assert.equal(twice.state.blocked_from, "implementacao");

  const green = evaluateStage(
    at("verificacao", { feedback: "x" }),
    "verificacao",
    { checks: [checks[0], checks[2]] },
    ctx
  );
  assert.equal(green.state.state, "aguardando-revisao");
  assert.equal(green.state.feedback, null);
});

test("verificacao: a green PR that meets the policy skips the human review", () => {
  const green = [{ name: "lint", result: "pass" }];
  const eligible = { decision: "auto-approve", head_sha: "abc123" };
  const auto = evaluateStage(
    at("verificacao"),
    "verificacao",
    { checks: green, head_sha: "abc123", autoapproval: eligible },
    ctx
  );
  assert.equal(auto.state.state, "auto-aprovacao");
  assert.equal(auto.state.verified_sha, "abc123");

  const manual = {
    checks: green,
    head_sha: "abc123",
    autoapproval: { decision: "manual-review", head_sha: "abc123" },
  };
  assert.equal(
    evaluateStage(at("verificacao"), "verificacao", manual, ctx).state.state,
    "aguardando-revisao"
  );

  const moved = { checks: green, head_sha: "def456", autoapproval: eligible };
  assert.equal(
    evaluateStage(at("verificacao"), "verificacao", moved, ctx).state.state,
    "aguardando-revisao",
    "the policy must have measured the commit that was checked"
  );

  const off = { ...ctx, limits: { ...DEFAULT_LIMITS, autoApprove: false } };
  const disabled = { checks: green, head_sha: "abc123", autoapproval: eligible };
  assert.equal(
    evaluateStage(at("verificacao"), "verificacao", disabled, off).state.state,
    "aguardando-revisao"
  );

  const failing = { checks: [{ name: "lint", result: "fail" }], head_sha: "abc123", autoapproval: eligible };
  assert.equal(evaluateStage(at("verificacao"), "verificacao", failing, ctx).state.state, "implementacao");
});

test("auto-aprovacao finishes only when ready, approved and merged are all observed", () => {
  const facts = {
    head_unchanged: true,
    head_sha: "abc123",
    ready: true,
    approved: true,
    approved_by: "joao",
    merged: true,
    merge_sha: "fff",
  };
  const done = evaluateStage(at("auto-aprovacao"), "auto-aprovacao", facts, ctx);
  assert.equal(done.state.state, "concluido");
  assert.ok(done.outcome.checks.every((c) => c.pass));

  const noApprover = {
    ...facts,
    approved: false,
    approve_error: "secret HARNESS_APPROVER_TOKEN não configurado",
    merged: false,
  };
  const fallback = evaluateStage(at("auto-aprovacao"), "auto-aprovacao", noApprover, ctx);
  assert.equal(fallback.state.state, "aguardando-revisao", "falls back to a human, no retry");
  assert.ok(fallback.outcome.checks.some((c) => !c.pass && /HARNESS_APPROVER_TOKEN/.test(c.details)));

  const moved = evaluateStage(
    at("auto-aprovacao"),
    "auto-aprovacao",
    { ...facts, head_unchanged: false },
    ctx
  );
  assert.equal(moved.state.state, "aguardando-revisao");
});

test("a result that arrives after the issue moved on is discarded", () => {
  const r = evaluateStage(at("cancelado"), "implementacao", okImpl, ctx);
  assert.equal(r.stale, true);
  assert.equal(r.state.state, "cancelado");
});

test("the panel round-trips its state and shows the pending decision", () => {
  const state = {
    ...at("aguardando-plano"),
    history: [
      {
        at: now,
        stage: "planejamento",
        result: "ok",
        to: "aguardando-plano",
        by: "harness",
        details: "a | b",
      },
    ],
  };
  const body = renderPanel(state);
  assert.deepEqual(parsePanel(body), state);
  assert.match(body, /`\/aprovar`/);
  assert.match(body, /a \\\| b/);
  assert.equal(parsePanel("just a comment"), null);
  const tricky = { ...state, feedback: "fechar --> o comentário" };
  assert.deepEqual(parsePanel(renderPanel(tricky)), tricky);
});

test("stage comment lists exit conditions and the decision to take", () => {
  const { state, outcome } = evaluateStage(at("planejamento"), "planejamento", okPlan, ctx);
  const body = renderStageComment({ stage: "planejamento", outcome, state, body: "## Problema\n..." });
  assert.match(body, /✋ Etapa `planejamento` → `aguardando-plano`/);
  assert.match(body, /\| plan\.md gerado \| ✅/);
  assert.match(body, /Decisão necessária.*`\/aprovar`.*`\/revisar`.*`\/cancelar`/);
});

test("missingPlanSections checks the required headings", () => {
  assert.deepEqual(
    missingPlanSections("## Problema\n## Abordagem\n## Premissas\n## Arquivos\n## Testes"),
    []
  );
  assert.deepEqual(missingPlanSections("## Problema\n## Testes"), ["Abordagem", "Premissas", "Arquivos"]);
});
