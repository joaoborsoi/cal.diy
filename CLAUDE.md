# CLAUDE.md

## Horário comercial e fusos horários

Respostas registradas em entrevista (2026-09-01).

### Fuso de referência
- Fuso canônico do projeto e da equipe: **America/Sao_Paulo (BRT)**.
- Agendas, cron jobs, logs e comunicação assumem esse fuso salvo indicação explícita em contrário.

### Janela de horário comercial
- Horário comercial padrão: **09:00–18:00**.
- Fora dessa janela é considerado fora do expediente.

### Dias úteis
- Dias úteis: **segunda a sexta**.
- Sábado e domingo não são dias úteis.

### Feriados
- **Ignorar feriados** no cálculo de horário comercial e de prazos.
- Apenas fins de semana contam como não úteis; feriados (nacionais, estaduais ou municipais) contam normalmente.

### Horário de verão (DST)
- **Brasil não observa horário de verão** (fixo em UTC-3 desde 2019); tratar America/Sao_Paulo como offset estável.
- Para fusos estrangeiros, **respeitar o DST** via IANA tz database — não fixar offset manualmente para esses casos.

### Usuários em outros fusos
- **Detectar e converter automaticamente**: identificar o fuso do usuário (browser/perfil) e exibir todos os horários já convertidos para o fuso dele.

### Solicitações fora do expediente
- **Sem garantia / melhor esforço**: não há SLA definido para solicitações recebidas fora do horário comercial; atendimento quando possível.
- O formulário de reserva (`BookEventForm`) exibe um aviso não bloqueante quando o horário selecionado cai fora da janela comercial (fim de semana, antes das 09:00 ou às/depois das 18:00 em America/Sao_Paulo). Regra em `packages/features/bookings/lib/isOutsideBusinessHours.ts`.
