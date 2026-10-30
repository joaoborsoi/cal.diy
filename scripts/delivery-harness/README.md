# Harness de entrega (Claude Code + GitHub Actions)

Uma issue com a label **`priorizado`** percorre as etapas de entrega em
`.github/workflows/delivery-harness.yml`. O workflow lê o estado da issue,
escolhe a próxima etapa, verifica as condições de avanço, registra o resultado
na issue e pede decisões humanas por comentários.

```
            priorizado
                │
                ▼
          ┌──────────┐ score ≥ 2  ┌───────────────────────────┐
          │ triagem  │──────────▶│ aguardando-esclarecimento │──/retomar──▶ triagem
          └────┬─────┘           └─────────────┬─────────────┘
               │ score ≤ 1                     │ /aprovar
               ▼                               ▼
          ┌──────────────┐  plano ok  ┌──────────────────┐
          │ planejamento │──────────▶│ aguardando-plano │──/revisar──▶ planejamento
          └──────────────┘           └────────┬─────────┘
                                              │ /aprovar
                                              ▼
          ┌───────────────┐ > limite  ┌───────────────────┐
          │ implementacao │─────────▶│ aguardando-escopo │──/revisar──▶ implementacao
          └──────┬────────┘          └────────┬──────────┘
                 │ ≤ limite                   │ /aprovar
                 ▼                            ▼
          ┌─────────────┐  falhou (volta com feedback, até HARNESS_MAX_ATTEMPTS)
          │ verificacao │──────────────────────────────────────────▶ implementacao
          └──────┬──────┘
                 │ tudo verde
                 ├────────────────────────────┐ elegível pela política de auto-aprovação
                 │ não elegível               ▼
                 │                     ┌────────────────┐ aprovado + merge ┌───────────┐
                 │                     │ auto-aprovacao │────────────────▶│ concluido │
                 │                     └───────┬────────┘                  └───────────┘
                 │                             │ algum passo falhou              ▲
                 ▼                             ▼                                 │
          ┌────────────────────┐◀──────────────┘                                 │
          │ aguardando-revisao │──/aprovar (PR sai de rascunho)──────────────────┘
          └────────────────────┘

  Qualquer etapa automática que falha repete até HARNESS_MAX_ATTEMPTS e depois
  vai para `bloqueado` (/retomar volta para a etapa que travou).
  /cancelar vale em qualquer estado não final.
```

## Como funciona

| Peça | Papel |
|---|---|
| `lib.mjs` | Máquina de estados pura: tabela de estados, comandos, `route()` e as condições de saída de cada etapa (`evaluateStage`). Testada em `lib.test.mjs`. |
| `route.mjs` | 1º passo de toda execução: lê o evento, aplica a label ou o comando humano, salva o estado e diz qual etapa rodar. |
| `stages/*.sh` | Executam a etapa e gravam `facts.json` — fatos **observados** (exit codes, `git status`, commits, PR, checks), não a palavra do agente. |
| `advance.mjs` | Último passo: avalia os fatos contra as condições de saída, comenta o resultado, move o estado e despacha a próxima execução se ela for automática. |
| `run-agent.sh` | Roda `claude -p /<skill>` com schema JSON na resposta e ferramentas restritas por perfil (`plan` só lê; `implement` edita e commita). |
| `.claude/skills/harness-plan`, `harness-implement` | Instruções do agente em cada etapa. |

**Estado:** um comentário-painel na issue (feito pelo `github-actions[bot]`)
guarda o JSON do estado num comentário HTML e mostra o histórico de todas as
etapas e decisões. A label `harness:<estado>` espelha o estado para filtros.

**Encadeamento:** cada execução roda no máximo uma etapa. Eventos criados com o
`GITHUB_TOKEN` não disparam workflows, exceto `workflow_dispatch` — por isso o
`advance.mjs` despacha o próprio workflow. Qualquer evento "bombeia" a máquina:
se a issue está numa etapa automática, ela roda, então um dispatch perdido se
recupera no próximo comentário.

**Concorrência:** um grupo por issue, sem cancelar execuções em andamento. Se
um humano cancelar durante uma etapa, o resultado dela é descartado.

## Condições de avanço

| Etapa | Avança quando | Senão |
|---|---|---|
| triagem | juiz de ambiguidade (`scripts/issue-ambiguity`) dá 0–1 | 2–3 → pede esclarecimento |
| planejamento | `plan.md` existe, tem as seções Problema/Abordagem/Premissas/Arquivos/Testes e nenhum arquivo do repo mudou | repete / bloqueia; `needs_clarification` → pede esclarecimento |
| implementacao | agente reporta `completed`, há commits novos, árvore limpa, branch publicado e PR rascunho aberto | repete / bloqueia; acima de `HARNESS_MAX_CHANGED_LINES`/`FILES` → decisão de escopo |
| verificacao | lint (biome), testes alterados (vitest) e type-check dos workspaces tocados passam; lógica `.ts` vem com teste. Se a política de auto-aprovação aprovar o mesmo commit verificado → `auto-aprovacao`; senão → revisão humana | volta à implementação com as falhas como feedback |
| auto-aprovacao | PR ainda no commit verificado, fora de rascunho, aprovado nesse commit e mergeado — cada passo relido da API | volta para `aguardando-revisao` (sem retry) com o motivo |

### Auto-aprovação

A política é a de `scripts/pr-autoapproval/policy.json` (frontend, ≤ 200
linhas), avaliada de forma determinística no commit que a verificação testou.
Quando ela aprova e todos os checks estão verdes, nenhum humano é chamado: o
harness tira o PR de rascunho, envia uma review `APPROVE` fixada nesse commit,
faz o merge (`sha` fixado — se alguém der push no meio, o merge é recusado) e
apaga o branch. A aprovação do plano continua sendo humana.

O PR é aberto pelo `github-actions[bot]`, e o GitHub não deixa o autor aprovar
o próprio PR. Por isso a review usa o secret `HARNESS_APPROVER_TOKEN`, de outra
conta. Sem ele, a etapa registra o motivo e cai na revisão humana.

## Comandos na issue

Só contam comentários de OWNER, MEMBER ou COLLABORATOR, começando por:

- `/aprovar` — aprova e segue
- `/revisar <texto>` — refaz a etapa anterior com o feedback
- `/retomar` — tenta de novo de onde parou
- `/cancelar` — encerra (adicionar `priorizado` de novo recomeça)

## Configuração

- Secret `CLAUDE_CODE_OAUTH_TOKEN` (já criado pelo `/install-github-app`).
- Secret `HARNESS_APPROVER_TOKEN` para a auto-aprovação: token de uma conta com
  acesso de escrita que **não** seja o `github-actions[bot]` (PAT fine-grained
  com *Pull requests: read and write* neste repositório, ou token de GitHub App).
  A review aparece em nome dessa conta.
- Variáveis opcionais do repositório: `HARNESS_AUTO_APPROVE` (`true`; `false`
  manda todo PR para revisão humana), `HARNESS_MERGE_METHOD` (`squash`,
  `merge` ou `rebase`), `HARNESS_MAX_ATTEMPTS` (2),
  `HARNESS_MAX_CHANGED_LINES` (500), `HARNESS_MAX_CHANGED_FILES` (10),
  `HARNESS_AMBIGUITY_SAMPLES` (3), `HARNESS_MODEL`, `HARNESS_MAX_BUDGET_USD`.
- O workflow precisa estar no branch padrão para receber eventos de issue.
- Em *Settings → Actions → General*, habilite "Allow GitHub Actions to create
  and approve pull requests", senão o PR rascunho não é criado.
- As labels são criadas na primeira execução; para a primeira, crie
  `priorizado` à mão (ou rode o workflow por *Run workflow*).

## Segurança

- O texto da issue é tratado como dado não confiável nos prompts.
- O agente não recebe credenciais do GitHub (`env -u GH_TOKEN`), o checkout não
  persiste credenciais e `git push`/`gh`/`curl` são negados ao agente; quem faz
  push é o script da etapa, depois que o agente termina.
- As ferramentas do harness são copiadas do branch padrão antes de qualquer
  checkout do branch do agente, então código gerado não substitui o harness.
- Código gerado (testes, lint, type-check, `yarn install`) roda sem token.
- O token do aprovador só entra no passo `auto-aprovacao`, que roda apenas os
  scripts do branch padrão — nenhum código do agente executa nesse passo.
- Pushes, PRs e merges feitos com `GITHUB_TOKEN` não disparam workflows (nem o
  CI do PR, nem os de push no `main`);
  por isso a etapa de verificação roda os checks escopados. O CI completo roda
  no próximo push ou re-run feito por um humano.

## Testes

```bash
node --test scripts/delivery-harness/lib.test.mjs
```
