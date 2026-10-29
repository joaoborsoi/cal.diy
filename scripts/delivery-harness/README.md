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
                 ▼
          ┌────────────────────┐ /aprovar ┌───────────┐
          │ aguardando-revisao │────────▶│ concluido │  (PR sai de rascunho)
          └────────────────────┘         └───────────┘

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
| verificacao | lint (biome), testes alterados (vitest) e type-check dos workspaces tocados passam; lógica `.ts` vem com teste | volta à implementação com as falhas como feedback |

A política de auto-aprovação (`scripts/pr-autoapproval`) roda na verificação
como informação para a revisão humana; não bloqueia.

## Comandos na issue

Só contam comentários de OWNER, MEMBER ou COLLABORATOR, começando por:

- `/aprovar` — aprova e segue
- `/revisar <texto>` — refaz a etapa anterior com o feedback
- `/retomar` — tenta de novo de onde parou
- `/cancelar` — encerra (adicionar `priorizado` de novo recomeça)

## Configuração

- Secret `CLAUDE_CODE_OAUTH_TOKEN` (já criado pelo `/install-github-app`).
- Variáveis opcionais do repositório: `HARNESS_MAX_ATTEMPTS` (2),
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
- Pushes e mudanças de PR feitos com `GITHUB_TOKEN` não disparam o CI do PR;
  por isso a etapa de verificação roda os checks escopados. O CI completo roda
  no próximo push ou re-run feito por um humano.

## Testes

```bash
node --test scripts/delivery-harness/lib.test.mjs
```
