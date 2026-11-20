# Relatório da tarefa 92 — Troca de IA por conversa

## O que foi feito

- Criada a migração `045-conversation-model`, com as colunas nullable `model_provider_id` e `model` e FK `ON DELETE SET NULL`.
- Criadas as rotas autenticadas `GET/PUT /api/v1/conversations/:id/model`, com filtro por proprietário, validação do corpo sem eco dos valores e recusa fixa de modelo indisponível.
- A listagem de conversas agora retorna os campos de modelo. No chat, a escolha salva ou enviada explicitamente tem precedência; indisponibilidade usa o modelo principal e os fallbacks do agente, preservando a escolha armazenada. A gravação explícita falha fechada antes da chamada ao provedor.
- O desktop inicializa o seletor com a escolha da conversa, persiste trocas e o retorno ao padrão, mostra provedor e modelo e exibe erro temporário no composer.
- Documentada a precedência em `docs/TROCA_DE_IA_POR_CHAT.md`, apontada a partir do documento de modelo/esforço e marcada a tarefa como Feita no resumo do `FALTA_OPENBOT.md`.

Precedência implementada: (a) modelo escolhido na conversa, se disponível; (b) modelo principal do agente e cadeia de reservas; (c) padrão atual do chat. A escolha indisponível não é apagada. O histórico não é modificado.

## Arquivos alterados

- `apps/backend/src/modules/database/migrations/045-conversation-model.ts`
- `apps/backend/src/modules/database/migrations/045-conversation-model.spec.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/chat/conversations.service.ts`
- `apps/backend/src/modules/chat/conversations.controller.ts`
- `apps/backend/src/modules/chat/conversations.controller.spec.ts`
- `apps/backend/src/modules/chat/chat.controller.ts`
- `apps/backend/src/modules/chat/chat.controller.spec.ts`
- `apps/backend/src/modules/chat/conversation-model.e2e.spec.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/workspace.ts`
- `apps/desktop/src/lib/conversation-model.ts`
- `apps/desktop/src/lib/conversation-model.test.ts`
- `docs/TROCA_DE_IA_POR_CHAT.md`
- `docs/MODELO_E_ESFORCO_POR_CHAT.md`
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-92-relatorio.md` (este relatório)

## Comandos de verificação e resultados

| Comando | Resultado real |
| --- | --- |
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | exit 0 — 118 suítes passaram, 13 puladas; 608 testes passaram, 24 pulados |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/desktop test` | exit 0 — 43 arquivos passaram; 193 testes passaram |
| `git diff --cached --check` | exit 0 |
| Busca no diff staged por `sk-…`, `tvly-`, `ntn_` e sequências hexadecimais de 64 caracteres | nenhuma linha correspondente; literais fictícios não foram necessários |
| `rg -n 'window\.confirm|alert\(' apps/desktop/src/lib/conversation-model.ts apps/desktop/src/App.tsx` | uma ocorrência preexistente em `App.tsx` na remoção de provedor; nenhuma ocorrência nova |

Na primeira execução do teste completo do backend, o teste recém-criado da migração falhou (exit 1) porque sua expressão detectava `ON DELETE SET NULL` como remoção destrutiva. A verificação foi corrigida para identificar `DELETE FROM`; a execução completa final passou com os totais acima.

## Commits locais

- Implementação: `20162c3a59e1cdd9b48a9649eaa87f2f9ddd81cf` — `feat(backend): troca de IA salva por conversa` — hash copiado de `git log -1`; autor verificado: `Jadson Reis <jrdesign9@gmail.com>`; sem `Co-Authored-By`.
- Este relatório é gravado em commit separado após o commit de implementação, para registrar aqui o hash real obtido por `git log -1` antes de incluir o próprio relatório.

## Pendente

- A migração e o ciclo de API/chat foram exercitados com dublês; não foi aplicado SQL nem feita chamada a provedor real, conforme o escopo e as restrições da tarefa.
- Não foi feito teste visual de DOM do seletor, pois o projeto não tem harness de DOM e a especificação dispensou esse teste.
- Não há ação pendente para o dono nesta tarefa.
