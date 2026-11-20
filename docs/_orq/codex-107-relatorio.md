# Relatório — tarefa 107

## Causa confirmada

O desktop reenviava o histórico da pergunta ao usar Refazer, e o controller persistia a última mensagem de usuário a cada chamada. O mesmo fluxo também mantinha a resposta antiga no banco. Além disso, o botão Refazer passava uma lista vazia de arquivos; sem `attachments` com o `dataUrl`, o backend não podia montar o conteúdo multimodal da requisição.

## O que mudou

- A rota de chat aceita `regenerate` opcional e rejeita valores que não sejam booleanos com HTTP 400. Em regeneração não grava nova mensagem de usuário.
- Depois de obter uma resposta com sucesso, o controller remove somente a última resposta de assistente da conversa do proprietário autenticado e grava a nova. Falhas antes da conclusão mantêm a resposta anterior. O caminho de endpoint também segue a substituição quando obtém resposta.
- O botão Refazer encaminha os anexos persistidos da pergunta. O desktop envia `regenerate: true` e mantém a mesma pergunta na tela.
- Foram adicionados testes do controller (validação, não duplicação, substituição após sucesso, preservação em falha e regressão sem o campo) e teste da montagem dos campos/anexos no desktop, incluindo o `dataUrl` original.

## Verificações executadas

| Comando | Exit code | Resultado |
|---|---:|---|
| `corepack pnpm --filter @grupo-jadson/backend exec tsc --noEmit` | 0 | Typecheck passou. |
| `corepack pnpm --filter @grupo-jadson/backend test -- chat` | 0 | 18 suites passaram, 3 skipped; 131 testes passaram, 5 skipped. |
| `corepack pnpm --filter @grupo-jadson/backend test` | 0 | 134 suites passaram, 16 skipped; 686 testes passaram, 30 skipped. |
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | 0 | Typecheck passou. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 55 arquivos passaram; 232 testes passaram. |
| `git diff --check` | 0 | Sem erros de whitespace. |

Durante a edição, uma execução intermediária de `backend test -- chat` falhou por assinatura de mock incompatível no teste recém-adicionado; a assinatura foi corrigida e a execução final passou. Os totais acima são das execuções finais.

## Arquivos alterados nesta tarefa

- `apps/backend/src/modules/chat/chat.controller.ts`
- `apps/backend/src/modules/chat/chat.controller.spec.ts`
- `apps/backend/src/modules/chat/conversations.service.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/chat-request.ts` (novo)
- `apps/desktop/src/lib/chat-request.test.ts` (novo)
- `docs/_orq/codex-107-relatorio.md` (este arquivo)

## Commit

`COMMIT_SHA_PENDENTE` — `fix(chat): Refazer não duplica a pergunta no servidor nem perde os anexos (tarefa 107)`

## Pendente / limites

- Não foi feita verificação visual manual em navegador nem foram criadas capturas.
- Não foi feita chamada contra uma base PostgreSQL real; a remoção por ownership está coberta pela implementação SQL e o comportamento do controller por mocks.
- Permanecem intactas as alterações locais preexistentes fora dos arquivos desta tarefa, incluindo `apps/desktop/src-tauri/build.rs`, `apps/desktop/src-tauri/crates/grupo-core/Cargo.lock` e arquivos de orquestração em `docs/_orq/`. Não foram incluídos no commit.