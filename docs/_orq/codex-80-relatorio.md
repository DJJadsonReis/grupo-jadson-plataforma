# Relatório da tarefa 80 — atendimento humano

## O que foi feito

- Criada a fila persistente de atendimento humano, com motivo mascarado, conversa, agente, solicitante, estado e datas; operações auditadas.
- Administradores atendem por padrão. Admin pode liberar ou remover atendentes em “Pessoas e acessos”; usuários sem liberação recebem 403.
- Atendentes recebem notificação interna. Quem pediu não recebe a notificação de novo pedido; ao resolver, recebe uma notificação interna de resolução.
- Assumir usa atualização condicional atômica e retorna 409 quando o pedido já foi assumido. Resolver é permitido ao responsável ou a um admin.
- Criada a seção “Atendimento” no desktop, visível somente se a API autorizar, com contagem de pedidos abertos, ações e erros discretos.
- O motivo é mascarado antes de persistir a entrada da execução da ferramenta e antes de persistir/devolver o pedido.
- Atualizada a evidência do item em `docs/FALTA_OPENBOT.md`.

## Arquivos alterados

- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/users.controller.ts`
- `apps/backend/src/modules/auth/users.service.ts`
- `apps/backend/src/modules/chat/chat.controller.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/migrations/041-human-support.ts`
- `apps/backend/src/modules/database/migrations/041-human-support.spec.ts`
- `apps/backend/src/modules/human-support/human-support.controller.ts`
- `apps/backend/src/modules/human-support/human-support.controller.spec.ts`
- `apps/backend/src/modules/human-support/human-support.module.ts`
- `apps/backend/src/modules/human-support/human-support.service.ts`
- `apps/backend/src/modules/human-support/human-support.service.spec.ts`
- `apps/backend/src/modules/tools/tools.module.ts`
- `apps/backend/src/modules/tools/tools.service.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/human-support-api.ts`
- `apps/desktop/src/lib/human-support.test.ts`
- `apps/desktop/src/lib/human-support.ts`
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-80-relatorio.md`

## Commit

- Implementação: `0586aea9cd20a956c50a88e136c7ead4289db825` — `feat: implementar fila de atendimento humano`
- Autor conferido com `git log -1`: Jadson Reis <jrdesign9@gmail.com>.

## Comandos e resultados

| Comando | Exit code | Resultado |
| --- | ---: | --- |
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | 0 | TypeScript sem erros. |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | 0 | TypeScript sem erros. |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | 0 | 106 suítes passaram; 12 suítes foram puladas por dependerem de PostgreSQL; 517 testes passaram e 23 foram pulados. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 36 arquivos passaram; 169 testes passaram. Inclui os testes de regras e cliente HTTP de atendimento. |
| `git diff --cached --check` | 0 | Nenhum erro de whitespace no conteúdo preparado para o commit. |
| Verificação de presença de `TEST_DATABASE_URL` no ambiente (sem imprimir valor) | 0 | Resultado `False`; variável ausente. |

## Pendente

- A validação de persistência e concorrência contra PostgreSQL real não foi executada: `TEST_DATABASE_URL` não estava definido. Nenhum teste foi apontado para a base de desenvolvimento.
- A seção visual foi coberta por typecheck e testes das regras/client HTTP; não há teste de DOM da tela neste conjunto de testes.
- Não foram feitos envios externos. Não foi alterado `.env` nem adicionado dependência.
