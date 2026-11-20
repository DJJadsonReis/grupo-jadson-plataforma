# Relatório da tarefa 94 — Servidor MCP do Grupo Jadson

## O que foi feito

- Adicionado o endpoint HTTP JSON-RPC em `/api/v1/mcp-server`, com autenticação por token MCP individual, limite de 64 KB e respostas de erro MCP para JSON malformado e método desconhecido.
- Adicionada a migration `047-mcp-server-tokens`, que guarda SHA-256, lista somente metadados e revoga com `revoked_at`.
- Implementadas auditoria sem argumentos de texto livre e ferramentas com escopo do dono do token: `plataforma_status`, `tarefas_listar`, `tarefas_criar`, `memoria_listar`, `memoria_lembrar`, `agentes_listar`, `rotinas_listar` e `notificacoes_listar`.
- Implementados recursos `agente://{id}` com metadados visíveis e sem instruções internas, além dos dois prompts fixos.
- Adicionado o painel **Configurações > Acesso MCP**, com criação de token de exibição única, cópia e confirmação própria para revogação. O trecho de configuração usa `<SEU_TOKEN>`.
- Atualizado `docs/FALTA_OPENBOT.md` e criado `docs/MCP_GRUPO_JADSON.md`.

**Divergência na especificação:** o escopo enumera oito ferramentas, embora um critério diga “6 ferramentas”. Foram implementadas e testadas as oito ferramentas explicitamente enumeradas.

## Teste ponta a ponta

Suíte `mcp-server.e2e.spec.ts`; teste **“execute o fluxo completo isolando tarefas por pessoa e revogando o token”**: passou. O cenário cria tokens para A e B, chama `initialize`, `tools/list`, cria/lista tarefa com o serviço `TasksService`, confirma o isolamento de B, verifica auditoria, notificação HTTP 202, limite HTTP 413, erro JSON `-32700` e revogação com HTTP 401.

## Arquivos alterados

- `apps/backend/src/app.module.ts`
- `apps/backend/src/main.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/migrations/047-mcp-server-tokens.ts`
- `apps/backend/src/modules/database/migrations/047-mcp-server-tokens.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.controller.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.module.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-protocol.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-protocol.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tokens.service.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tokens.service.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tools.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tools.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.controller.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.e2e.spec.ts`
- `apps/backend/src/modules/routines/routines.module.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/mcp/McpAccessPanel.tsx`
- `apps/desktop/src/lib/mcp-server-api.ts`
- `apps/desktop/src/lib/mcp-server-config.ts`
- `apps/desktop/src/lib/mcp-server-config.test.ts`
- `docs/MCP_GRUPO_JADSON.md`
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-94-relatorio.md` (este relatório; commit documental separado)

## Commits

- Implementação: `d73a2d448c48a8cd41b8efc6d5f916980665b36f` — `feat: servidor MCP do Grupo Jadson com token por pessoa`; autor verificado: `Jadson Reis <jrdesign9@gmail.com>`, sem `Co-Authored-By`.
- Este relatório foi incluído em commit documental separado porque o hash da implementação precisa ser real e não pode ser incluído dentro do próprio commit cujo hash ele representa.

## Comandos e resultados reais

| Comando | Exit code e resultado |
| --- | --- |
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | **0** na rodada final. Uma tentativa inicial terminou em **1** por dois acessos a índice possivelmente indefinido; corrigido antes da rodada final. |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | **0**; 127 suítes passaram, 13 foram puladas; 639 testes passaram, 24 foram pulados (663 total). A suíte PostgreSQL real não foi executada; migration verificada pelo teste de SQL com dublê. |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | **0**. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | **0**; 45 arquivos e 202 testes passaram. |
| Testes focados: `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand src/modules/mcp-server src/modules/database/migrations/047-mcp-server-tokens.spec.ts` | **0** na rodada focada final antes dos últimos ajustes; 6 suítes e 14 testes passaram. A suíte completa acima também passou após os últimos ajustes. Tentativas intermediárias falharam em expectativas de fixture e no tratamento de JSON malformado; ambas foram corrigidas. |
| `git diff --cached --check` e `git diff --check` | **0** em ambos. |
| Busca de segredo no diff staged (`git diff --cached -U0`, filtrado por padrões conhecidos de credenciais, tokens MCP longos e sequências hexadecimais de 64 caracteres) | `rg` retornou **1**, sem correspondências — resultado esperado. |
| Busca por `window.confirm` e `alert(` nos arquivos novos do painel | `rg` retornou **1**, sem correspondências — resultado esperado. |
| `git log -1 --format='%H %an <%ae>%n%B'` após o commit de implementação | **0**; hash, autor e mensagem acima. |

Não foram adicionadas dependências. Não houve conexão a provedor de IA ou serviço externo. Não foram lidos nem alterados `.env` ou `setup.json`.

## Fora do escopo e pendências

- Stdio, conversa com agente, Google Drive/Docs e criação/alteração de rotina continuam fora desta etapa. Nenhuma ferramenta de apagar foi exposta.
- O dono deve testar o painel no desktop e conectar os clientes externos usando um endereço HTTP que eles alcancem; criar um token separado para cada cliente e guardá-lo no próprio cliente.
- Não foi feita validação contra PostgreSQL real com `TEST_DATABASE_URL`; a migration foi verificada com teste de SQL simulado.
