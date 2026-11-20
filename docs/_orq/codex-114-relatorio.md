# Relatório da tarefa 114 — Check-ins proativos

## O que foi feito

- Criada a migração 053 para check-ins, sugestões, índices e o tipo de notificação `checkin.message`; registrada na inicialização do banco.
- Implementadas as rotas e o serviço com escopo pelo principal, limite de cinco check-ins ativos, intervalo mínimo de uma hora, seis execuções por dia, claim com lease, desligamento após seis falhas seguidas e auditoria.
- O turno recebe o foco e sugestões ocultadas/iniciadas dos últimos 30 dias. Só ferramentas de leitura são disponibilizadas. Respostas sem novidade registram `Nada novo desde a última verificação`, sem sugestão ou notificação.
- Sugestões repetidas por título normalizado são descartadas. Sugestões novas geram notificação. Iniciar cria uma conversa com o bot, inclui a mensagem como resposta do assistente e é idempotente.
- Adicionado o painel de check-ins no perfil do bot, validação pura no desktop, ações Iniciar conversa/Ocultar/Verificar agora e abertura da sugestão pela notificação. A galeria usada é a tela `agent-detail`, renderizada por `AgentDetailPage` em `apps/desktop/src/App.tsx`.
- Atualizada a matriz `docs/FALTA_OPENBOT.md` com evidências.

## Arquivos alterados

- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/checkins/checkins.controller.spec.ts`
- `apps/backend/src/modules/checkins/checkins.controller.ts`
- `apps/backend/src/modules/checkins/checkins.module.ts`
- `apps/backend/src/modules/checkins/checkins.pg.spec.ts`
- `apps/backend/src/modules/checkins/checkins.service.spec.ts`
- `apps/backend/src/modules/checkins/checkins.service.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/migrations/035-notifications-kinds.spec.ts` (compatibilidade do teste histórico com o tipo novo)
- `apps/backend/src/modules/database/migrations/053-checkins.pg.spec.ts`
- `apps/backend/src/modules/database/migrations/053-checkins.spec.ts`
- `apps/backend/src/modules/database/migrations/053-checkins.ts`
- `apps/backend/src/modules/notifications/notifications.service.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/checkins/CheckinsPanel.tsx`
- `apps/desktop/src/components/notifications/NotificationsPanel.tsx`
- `apps/desktop/src/lib/audit-labels.ts`
- `apps/desktop/src/lib/checkins.test.ts`
- `apps/desktop/src/lib/checkins.ts`
- `apps/desktop/src/lib/notifications.test.ts`
- `apps/desktop/src/lib/notifications.ts`
- `apps/desktop/src/styles/workspace.css`
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-114-relatorio.md`

## Commits locais

- Código: `eda1afb3ae91737974891b80452ac7b3c1b32566` — `feat(agents): check-ins proativos do bot (tarefa 114)`.
- Relatório e atualização da fila: commit separado `docs(agents): registrar relatório da tarefa 114`.
- O commit de código foi criado como `Jadson Reis <jrdesign9@gmail.com>` e não tem trailer `Co-Authored-By`.

## Comandos e resultados

| Comando | Resultado real |
|---|---|
| `corepack pnpm --filter @grupo-jadson/backend exec tsc --noEmit` | Exit 0. |
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | Exit 0. A primeira execução retornou exit 1 por props conectadas ao componente errado e ausência de imports do Vitest; corrigi ambos e a execução seguinte passou. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | Exit 0; 62 arquivos e 253 testes passaram. |
| `corepack pnpm --filter @grupo-jadson/backend test -- checkins` | Exit 0; 3 suítes passaram, 9 testes passaram, 2 suítes PostgreSQL foram ignoradas por falta de `TEST_DATABASE_URL`. Inclui concorrência simulada, isolamento, idempotência e migração com query simulada. |
| `corepack pnpm --filter @grupo-jadson/backend test -- responsibilities` | Exit 0; 1 suíte passou, 7 testes passaram e 1 suíte PostgreSQL foi ignorada. |
| `corepack pnpm --filter @grupo-jadson/backend test -- notifications` | Exit 0; 2 suítes passaram, 4 testes passaram e 1 suíte PostgreSQL foi ignorada. |
| `git diff --check` | Exit 0. O Git exibiu avisos de conversão LF/CRLF, que não são erros. |
| Busca dos rótulos no painel e das strings de notificação | Encontrados `Check-ins`, `Sugestões do bot`, `Iniciar conversa`, `Ocultar`, `Nenhuma sugestão por enquanto.`, `Verificar agora` e `Novo check-in`. |

### PostgreSQL

`TEST_DATABASE_URL` não estava configurada. Tentei os dois specs PostgreSQL usando a instância descartável local já documentada no repositório; a conexão falhou com `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` (exit 1). Nenhuma migração nem dado foi alterado nessa tentativa, e nenhum valor de URL foi registrado. Portanto, os critérios 1 e 3 **não foram verificados por PostgreSQL**; o claim concorrente do critério 3 foi coberto pelo teste de serviço com claim simulado. A migração passou no teste unitário idempotente.

O desktop não foi aberto em WebView para inspeção visual.

## Pendente

- Fornecer `TEST_DATABASE_URL` apontando para banco descartável com autenticação disponível e executar `checkins.pg.spec.ts` e `053-checkins.pg.spec.ts`.
- Inspeção visual em WebView/Desktop.
