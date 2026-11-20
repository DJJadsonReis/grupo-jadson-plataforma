# Relatório da tarefa 101

## O que foi feito

- Implementada a fila de tarefas para bots, com estados persistidos, lease de cinco minutos, reivindicação com `FOR UPDATE SKIP LOCKED`, limite de três tentativas e proteção contra atualização por claim obsoleto.
- Adicionadas rotas para enviar, cancelar e tentar novamente tarefas. O envio valida propriedade, bot habilitado e permissão; auditoria e notificações não incluem conteúdo da tarefa nem erros técnicos.
- Respostas concluídas são mascaradas usando os segredos conhecidos e limitadas a 20.000 caracteres.
- Extraída a geração de resposta para helper compartilhado por fila e salas de equipe.
- Atualizada a tela Tarefas com estados, ações de fila, seleção de bot habilitado, resultado e atualização periódica.
- Adicionada migração `051` para os campos/índice/estados da fila e `052` para habilitar os tipos de notificação da fila sem reescrever a migração 035.
- Adicionados testes unitários, e2e simulados, teste PG condicional e testes de funções puras do desktop.

## Arquivos alterados

- `apps/backend/src/modules/agents/agent-reply.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/migrations/051-task-queue.ts`
- `apps/backend/src/modules/database/migrations/052-task-notification-kinds.ts`
- `apps/backend/src/modules/notifications/notifications.service.ts`
- `apps/backend/src/modules/tasks/task-queue.e2e.spec.ts`
- `apps/backend/src/modules/tasks/task-queue.pg.spec.ts`
- `apps/backend/src/modules/tasks/task-queue.service.spec.ts`
- `apps/backend/src/modules/tasks/task-queue.service.ts`
- `apps/backend/src/modules/tasks/tasks.controller.ts`
- `apps/backend/src/modules/tasks/tasks.module.ts`
- `apps/backend/src/modules/tasks/tasks.service.ts`
- `apps/backend/src/modules/team-rooms/team-rooms.service.ts`
- `apps/desktop/src/components/tasks/TasksPage.tsx`
- `apps/desktop/src/lib/task-queue.test.ts`
- `apps/desktop/src/lib/task-queue.ts`
- `apps/desktop/src/lib/tasks.ts`

## Comandos executados e resultados

| Comando | Resultado |
|---|---|
| `apps/backend: corepack pnpm exec tsc --noEmit` | Exit code 0 |
| `apps/backend: corepack pnpm exec jest --runInBand` | Exit code 0; 133 suítes passaram, 16 ignoradas; 675 testes passaram, 30 ignorados |
| `apps/desktop: corepack pnpm typecheck` | Exit code 0 |
| `apps/desktop: corepack pnpm test` | Exit code 0; 49 arquivos e 212 testes passaram |
| `git diff --check` | Exit code 0 (avisos de conversão LF/CRLF do Git, sem erro de whitespace) |
| Verificação de presença de `TEST_DATABASE_URL` (sem imprimir o valor) | Ausente; o teste PG foi ignorado condicionalmente |

## Pendências

- O teste de integração PostgreSQL da migração e claims concorrentes não foi executado porque `TEST_DATABASE_URL` não está definido.
- Não foi validada uma chamada com provedor real; os testes usam provedor simulado, conforme a especificação.

## Commit

- A preencher após o commit local.
