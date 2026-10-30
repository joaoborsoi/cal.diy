// Delivery harness state machine. Pure functions only (no I/O) so every
// transition, gate and command can be unit-tested; route.mjs and advance.mjs
// do the GitHub calls.
//
// The state of an issue lives in a "panel" comment on the issue: a hidden JSON
// blob (source of truth) plus a rendered history table (the audit log). Labels
// `harness:<state>` mirror it for filtering.

export const TRIGGER_LABEL = "priorizado";
export const LABEL_PREFIX = "harness:";
export const PANEL_MARKER = "<!-- delivery-harness:state";
export const DEFAULT_LIMITS = {
  maxAttempts: 2,
  maxChangedLines: 500,
  maxChangedFiles: 10,
  autoApprove: true,
};

// kind: auto  → a job runs it; the workflow keeps advancing on its own.
//       human → the harness waits for a command on the issue.
//       final → nothing else happens (re-add the trigger label to start over).
export const STATES = {
  triagem: { kind: "auto", description: "Pontuando a ambiguidade da issue" },
  planejamento: { kind: "auto", description: "Claude escrevendo o plano técnico" },
  implementacao: { kind: "auto", description: "Claude implementando o plano aprovado" },
  verificacao: { kind: "auto", description: "Verificações determinísticas no branch" },
  "auto-aprovacao": {
    kind: "auto",
    description: "PR elegível: aprovando e fazendo merge sem revisão humana",
  },
  "aguardando-esclarecimento": {
    kind: "human",
    description: "A issue precisa de respostas do autor",
    commands: { retomar: "triagem", aprovar: "planejamento" },
  },
  "aguardando-plano": {
    kind: "human",
    description: "Plano aguardando aprovação",
    commands: { aprovar: "implementacao", revisar: "planejamento" },
  },
  "aguardando-escopo": {
    kind: "human",
    description: "Mudança acima do limite de tamanho",
    commands: { aprovar: "verificacao", revisar: "implementacao" },
  },
  "aguardando-revisao": {
    kind: "human",
    description: "PR verificado, aguardando revisão humana",
    commands: { aprovar: "concluido", revisar: "implementacao" },
  },
  bloqueado: {
    kind: "human",
    description: "Uma etapa falhou e esgotou as tentativas",
    // `retomar` goes back to state.blocked_from (resolved in applyCommand).
    commands: { retomar: null },
  },
  concluido: { kind: "final", description: "Entrega finalizada" },
  cancelado: { kind: "final", description: "Cancelado por um humano" },
};

export const AUTO_STAGES = Object.keys(STATES).filter((s) => STATES[s].kind === "auto");
export const COMMANDS = ["aprovar", "revisar", "retomar", "cancelar"];
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export const COMMAND_HELP = {
  aprovar: "aprova e segue para a próxima etapa",
  revisar: "`/revisar <o que mudar>` — refaz a etapa anterior com o seu feedback",
  retomar: "roda de novo a partir do ponto de parada",
  cancelar: "encerra o harness nesta issue",
};

export const isAuto = (state) => STATES[state]?.kind === "auto";
export const isFinal = (state) => !state || STATES[state]?.kind === "final";

export function initialState(issue, now) {
  return {
    version: 1,
    issue,
    state: "triagem",
    started_at: now,
    updated_at: now,
    attempts: {},
    feedback: null,
    blocked_from: null,
    plan_comment_id: null,
    branch: `harness/issue-${issue}`,
    pr: null,
    verified_sha: null,
    history: [],
  };
}

// --- commands ---------------------------------------------------------------

// First line of the comment: `/comando [texto]`. Text after the command (same
// line and following lines) is the feedback.
export function parseCommand(body) {
  const match = /^\s*\/([a-z]+)\b[ \t]*([\s\S]*)$/i.exec(body ?? "");
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!COMMANDS.includes(name)) return null;
  return { name, text: match[2].trim() };
}

export const isTrusted = (association) => TRUSTED_ASSOCIATIONS.has(association);

export function allowedCommands(state) {
  if (!state || isFinal(state.state)) return [];
  return [...Object.keys(STATES[state.state].commands ?? {}), "cancelar"];
}

// Returns { ok, state, reply } — `reply` explains a rejection to the human.
export function applyCommand(state, command, { actor, now }) {
  if (!state || isFinal(state.state)) {
    return {
      ok: false,
      reply: `Nada a fazer: o harness não está ativo nesta issue. Adicione a label \`${TRIGGER_LABEL}\` para começar.`,
    };
  }
  const from = state.state;
  const allowed = allowedCommands(state);
  if (!allowed.includes(command.name)) {
    const why = isAuto(from)
      ? `a etapa \`${from}\` está em andamento — aguarde o resultado`
      : `em \`${from}\` os comandos válidos são ${allowed.map((c) => `\`/${c}\``).join(", ")}`;
    return { ok: false, reply: `\`/${command.name}\` ignorado: ${why}.` };
  }
  if (command.name === "revisar" && !command.text) {
    return { ok: false, reply: "`/revisar` precisa de um texto: diga o que deve mudar." };
  }

  let to;
  if (command.name === "cancelar") to = "cancelado";
  else if (from === "bloqueado") to = state.blocked_from ?? "triagem";
  else to = STATES[from].commands[command.name];

  const next = {
    ...state,
    state: to,
    updated_at: now,
    // A human decision opens a fresh budget of automatic attempts.
    attempts: {},
    feedback: command.name === "revisar" ? command.text : command.name === "retomar" ? state.feedback : null,
    blocked_from: to === "bloqueado" ? state.blocked_from : null,
    history: [
      ...state.history,
      { at: now, stage: from, result: `/${command.name}`, to, by: actor, details: command.text || undefined },
    ],
  };
  return { ok: true, state: next };
}

// --- routing ----------------------------------------------------------------

// Decide what a workflow run should do. Any run "pumps" the machine: if the
// issue is in an automatic state the stage runs, whatever woke us up — so a
// lost dispatch or a crashed runner is recovered by the next event.
//
// event: { name: "labeled", label } | { name: "command", command, actor, association }
//      | { name: "dispatch" }
// Returns { state, changed, stage, reply }.
export function route(state, event, { issue, now }) {
  let current = state;
  let changed = false;
  let reply = null;

  if (event.name === "labeled") {
    if (event.label === TRIGGER_LABEL && isFinal(current?.state)) {
      const previous = current?.history ?? [];
      current = initialState(issue, now);
      current.history = [
        ...previous,
        { at: now, stage: "início", result: `label ${TRIGGER_LABEL}`, to: "triagem", by: event.actor },
      ];
      changed = true;
    }
  } else if (event.name === "command") {
    if (!isTrusted(event.association)) {
      reply = `Comando ignorado: apenas owners, membros e colaboradores podem decidir (associação de @${event.actor}: ${event.association}).`;
    } else {
      const result = applyCommand(current, event.command, { actor: event.actor, now });
      if (result.ok) {
        current = result.state;
        changed = true;
      } else {
        reply = result.reply;
      }
    }
  }

  const stage = current && isAuto(current.state) ? current.state : null;
  return { state: current, changed, stage, reply };
}

// --- exit gates ---------------------------------------------------------------

const check = (name, pass, details) => ({ name, pass: Boolean(pass), details });

// Each gate turns the facts a stage job collected into a list of named checks
// and a next state. Facts are produced by the workflow steps (deterministic
// observations: exit codes, git state, files) — never by trusting the agent's
// word alone.
const GATES = {
  triagem(f) {
    if (f.judge_exit === 2 || f.score == null) {
      return { error: "o juiz de ambiguidade falhou", checks: [check("juiz executou", false, f.error)] };
    }
    const checks = [check(`ambiguidade ${f.score}/3 ≤ 1`, f.score <= 1, f.reason)];
    return { checks, next: f.score <= 1 ? "planejamento" : "aguardando-esclarecimento" };
  },

  planejamento(f) {
    if (!f.agent_ok)
      return { error: `execução do Claude falhou (${f.agent_error ?? "sem resultado"})`, checks: [] };
    if (f.status === "needs_clarification") {
      return {
        checks: [check("plano possível sem esclarecimento", false, f.summary)],
        next: "aguardando-esclarecimento",
      };
    }
    const missing = f.plan_missing_sections ?? [];
    const checks = [
      check("plan.md gerado", f.plan_present),
      check(
        "seções obrigatórias",
        f.plan_present && missing.length === 0,
        missing.length ? `faltando: ${missing.join(", ")}` : undefined
      ),
      check(
        "nenhum arquivo do repo alterado",
        f.repo_clean,
        f.repo_clean ? undefined : f.dirty_files?.join(", ")
      ),
    ];
    return checks.every((c) => c.pass)
      ? { checks, next: "aguardando-plano" }
      : { checks, error: "o plano não passou nas condições de saída" };
  },

  implementacao(f, limits) {
    if (!f.agent_ok)
      return { error: `execução do Claude falhou (${f.agent_error ?? "sem resultado"})`, checks: [] };
    if (f.status !== "completed" && f.failure_reason === "needs_clarification") {
      return {
        checks: [check("implementável sem esclarecimento", false, f.summary)],
        next: "aguardando-esclarecimento",
      };
    }
    const checks = [
      check(
        "agente reportou completed",
        f.status === "completed",
        f.status === "completed" ? undefined : f.failure_reason
      ),
      check("commits novos no branch", f.new_commits > 0, `${f.new_commits ?? 0} commit(s)`),
      check("árvore de trabalho limpa", f.repo_clean, f.repo_clean ? undefined : f.dirty_files?.join(", ")),
      check(
        "branch publicado e PR aberto",
        f.pushed && f.pr_number,
        f.pr_number ? `PR #${f.pr_number}` : undefined
      ),
    ];
    if (!checks.every((c) => c.pass))
      return { checks, error: "a implementação não passou nas condições de saída" };

    const withinLines = f.changed_lines <= limits.maxChangedLines;
    const withinFiles = f.changed_files <= limits.maxChangedFiles;
    checks.push(
      check(`≤ ${limits.maxChangedLines} linhas alteradas`, withinLines, `${f.changed_lines} linhas`),
      check(`≤ ${limits.maxChangedFiles} arquivos alterados`, withinFiles, `${f.changed_files} arquivos`)
    );
    return { checks, next: withinLines && withinFiles ? "verificacao" : "aguardando-escopo" };
  },

  verificacao(f, limits) {
    const results = f.checks ?? [];
    if (results.length === 0) return { error: "nenhuma verificação executou", checks: [] };
    const checks = results.map((c) => ({
      name: c.name,
      pass: c.result !== "fail",
      details: [c.result, c.notes].filter(Boolean).join(" — "),
    }));
    if (checks.every((c) => c.pass)) {
      // A green PR that also meets scripts/pr-autoapproval/policy.json skips the
      // human review — but only for the exact commit the policy measured.
      const a = f.autoapproval ?? {};
      const eligible =
        limits.autoApprove && a.decision === "auto-approve" && a.head_sha && a.head_sha === f.head_sha;
      return { checks, next: eligible ? "auto-aprovacao" : "aguardando-revisao" };
    }
    // Failing checks go back to the agent with the failures as feedback; the
    // attempt budget of `implementacao` decides when a human has to step in.
    return { checks, next: "implementacao", retry_feedback: renderCheckFeedback(results) };
  },

  // Every step is re-read from the API after it was attempted. Any gap falls
  // back to the human review gate instead of retrying: approving and merging
  // are not things to keep trying blindly.
  "auto-aprovacao"(f) {
    const checks = [
      check("PR ainda no commit verificado", f.head_unchanged, f.head_sha?.slice(0, 12)),
      check("PR fora de rascunho", f.ready, f.ready_error),
      check(
        "PR aprovado no commit verificado",
        f.approved,
        f.approved ? `por @${f.approved_by}` : f.approve_error
      ),
      check("merge realizado", f.merged, f.merged ? f.merge_sha?.slice(0, 12) : f.merge_error),
    ];
    return { checks, next: checks.every((c) => c.pass) ? "concluido" : "aguardando-revisao" };
  },
};

function renderCheckFeedback(results) {
  const failed = results.filter((c) => c.result === "fail");
  return [
    "As verificações automáticas falharam. Corrija no mesmo branch:",
    ...failed.map((c) => `- ${c.name}${c.command ? ` (\`${c.command}\`)` : ""}: ${c.notes ?? "falhou"}`),
  ].join("\n");
}

// Evaluate a finished stage and compute the next state. Returns
// { state, outcome: { next, checks, error, retried }, stale } — `stale` means
// the issue moved on while the stage ran (e.g. /cancelar) and the result is
// only logged, never applied.
export function evaluateStage(state, stage, facts, { now, limits = DEFAULT_LIMITS, runUrl }) {
  if (state?.state !== stage) {
    return { stale: true, state, outcome: { next: state?.state ?? null, checks: [], error: null } };
  }
  const gate = GATES[stage](facts, limits);
  const attempts = { ...state.attempts, [stage]: (state.attempts[stage] ?? 0) + 1 };

  let next = gate.next;
  let feedback = state.feedback;
  let blocked_from = null;
  let error = gate.error ?? null;

  if (error) {
    // Retry the same stage while the budget lasts, then ask a human.
    next = attempts[stage] < limits.maxAttempts ? stage : "bloqueado";
    if (next === "bloqueado") blocked_from = stage;
  } else if (gate.retry_feedback) {
    const used = attempts[gate.next] ?? 0;
    if (used >= limits.maxAttempts) {
      next = "bloqueado";
      blocked_from = gate.next;
      error = `verificação falhou após ${used} tentativa(s) de implementação`;
    }
    feedback = gate.retry_feedback;
  } else if (next !== stage) {
    feedback = null;
  }

  const result = error
    ? next === stage
      ? "falhou, nova tentativa"
      : "falhou"
    : gate.retry_feedback
      ? "reprovado, volta ao agente"
      : "ok";
  const next_state = {
    ...state,
    state: next,
    updated_at: now,
    attempts,
    feedback,
    blocked_from,
    plan_comment_id: facts.plan_comment_id ?? state.plan_comment_id,
    pr: facts.pr_number ?? state.pr,
    // The commit verificacao measured; auto-aprovacao approves and merges only this one.
    verified_sha: stage === "verificacao" ? (facts.head_sha ?? null) : state.verified_sha,
    history: [
      ...state.history,
      {
        at: now,
        stage,
        result,
        to: next,
        by: "harness",
        details: error ?? summarizeChecks(gate.checks),
        run: runUrl,
      },
    ],
  };
  return {
    stale: false,
    state: next_state,
    outcome: { next, checks: gate.checks, error, retried: next === stage },
  };
}

const summarizeChecks = (checks) => {
  const failed = checks.filter((c) => !c.pass).length;
  return failed ? `${checks.length - failed}/${checks.length} condições ok` : `${checks.length} condições ok`;
};

// --- rendering ----------------------------------------------------------------

export function renderPanel(state) {
  const info = STATES[state.state];
  const commands = allowedCommands(state);
  const lines = [
    `${PANEL_MARKER}`,
    // `>` only occurs inside JSON strings; escaping it keeps feedback like "-->" from closing the comment.
    JSON.stringify(state).replace(/>/g, "\\u003e"),
    "-->",
    "## 🤖 Harness de entrega",
    "",
    `**Estado:** \`${state.state}\` — ${info.description}`,
    `**Branch:** \`${state.branch}\`${state.pr ? ` · **PR:** #${state.pr}` : ""}`,
  ];
  if (info.kind === "human") {
    lines.push(
      "",
      "**Decisão necessária.** Comente um dos comandos:",
      ...commands.map((c) => `- \`/${c}\` — ${COMMAND_HELP[c]}`)
    );
  } else if (info.kind === "auto") {
    lines.push("", "_Etapa automática em andamento; o resultado aparece aqui e em um comentário próprio._");
  }
  lines.push(
    "",
    "### Histórico",
    "",
    "| quando (UTC) | etapa | resultado | → estado | por | detalhes |",
    "|---|---|---|---|---|---|",
    ...state.history.map(
      (h) =>
        `| ${h.at.slice(0, 16).replace("T", " ")} | ${h.stage} | ${h.run ? `[${h.result}](${h.run})` : h.result} | \`${h.to}\` | ${h.by === "harness" ? "harness" : `@${h.by}`} | ${escapeCell(h.details ?? "")} |`
    )
  );
  return lines.join("\n");
}

export function parsePanel(body) {
  if (!body?.startsWith(PANEL_MARKER)) return null;
  const json = body.slice(PANEL_MARKER.length).split("\n-->")[0].trim();
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function renderStageComment({ stage, outcome, state, runUrl, body }) {
  const icon = outcome.error ? "❌" : outcome.next?.startsWith("aguardando") ? "✋" : "✅";
  const lines = [`### ${icon} Etapa \`${stage}\` → \`${outcome.next}\``, ""];
  if (outcome.error)
    lines.push(
      `**Falha:** ${outcome.error}${outcome.retried ? " — tentando de novo automaticamente." : ""}`,
      ""
    );
  if (outcome.checks.length) {
    lines.push("| condição de avanço | | detalhes |", "|---|---|---|");
    for (const c of outcome.checks)
      lines.push(`| ${c.name} | ${c.pass ? "✅" : "❌"} | ${escapeCell(c.details ?? "")} |`);
    lines.push("");
  }
  if (body) lines.push(body.trim(), "");
  if (STATES[outcome.next]?.kind === "human") {
    lines.push(
      "**Decisão necessária:** " +
        allowedCommands(state)
          .map((c) => `\`/${c}\``)
          .join(" · "),
      ""
    );
  }
  if (runUrl) lines.push(`<sub>[execução no Actions](${runUrl})</sub>`);
  return lines.join("\n");
}

const escapeCell = (text) => String(text).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 300);

// Sections the planning agent must produce (checked by the planejamento gate).
export const PLAN_SECTIONS = ["Problema", "Abordagem", "Premissas", "Arquivos", "Testes"];

export function missingPlanSections(markdown) {
  return PLAN_SECTIONS.filter((s) => !new RegExp(`^#{1,3}\\s+${s}\\b`, "im").test(markdown ?? ""));
}
