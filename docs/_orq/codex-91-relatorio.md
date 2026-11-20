# Relatório Codex — tarefa 91

Data: 2026-11-20

## O que foi feito

- Persistência por conversa em `conversations.reasoning_effort`, migração `044-conversation-effort` e rotas autenticadas de leitura/gravação. Entrada inválida retorna 400 com mensagem fixa; a consulta/alteração é filtrada pelo proprietário.
- Allowlist conservadora no backend e campo `supportsEffort` na lista de modelos. O chat passa o nível ao provedor só quando o modelo selecionado consta na allowlist. Modelos incompatíveis ignoram o valor salvo sem apagá-lo.
- Mapeamentos para OpenAI, Anthropic, Gemini e xAI; seletor no composer guiado pelo campo vindo do backend, persistência da conversa e aviso temporário em falha de rede.
- Documentação do mapeamento e fila atualizada com o item como Feito. Teste ponta a ponta simulado: **“salva alto, aplica em modelo compatível, ignora modelo sem suporte e restaura padrão”** — passou.

## Modelos e provedores

- OpenAI: `o1`, `o1-mini`, `o3`, `o3-mini`, `o4-mini`.
- Anthropic: `claude-sonnet-4-5`.
- Google Gemini: `gemini-2.5-pro`.
- xAI: `grok-3-mini`, `grok-3`.
- Sem suporte: endpoint Personalizado e Ollama. Modelos fora das listas acima também não recebem esforço.

Gemini e xAI já têm tipos no catálogo gerenciado (`apps/backend/src/modules/providers/model-catalogue.ts`) e usam o caminho compatível implementado em `apps/backend/src/modules/providers/providers.service.ts`; não foi criado provedor novo.

## Arquivos alterados

- `apps/backend/src/modules/chat/chat.controller.spec.ts`
- `apps/backend/src/modules/chat/chat.controller.ts`
- `apps/backend/src/modules/chat/conversations.controller.spec.ts`
- `apps/backend/src/modules/chat/conversations.controller.ts`
- `apps/backend/src/modules/chat/conversations.service.ts`
- `apps/backend/src/modules/chat/effort.e2e.spec.ts`
- `apps/backend/src/modules/chat/model-effort.spec.ts`
- `apps/backend/src/modules/chat/model-effort.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/migrations/044-conversation-effort.spec.ts`
- `apps/backend/src/modules/database/migrations/044-conversation-effort.ts`
- `apps/backend/src/modules/providers/anthropic.provider.spec.ts`
- `apps/backend/src/modules/providers/anthropic.provider.ts`
- `apps/backend/src/modules/providers/model-providers.service.spec.ts`
- `apps/backend/src/modules/providers/model-providers.service.ts`
- `apps/backend/src/modules/providers/openai.provider.spec.ts`
- `apps/backend/src/modules/providers/openai.provider.ts`
- `apps/backend/src/modules/providers/provider.types.ts`
- `apps/backend/src/modules/providers/providers.service.spec.ts`
- `apps/backend/src/modules/providers/providers.service.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/conversation-effort.test.ts`
- `apps/desktop/src/lib/conversation-effort.ts`
- `apps/desktop/src/lib/model-providers.test.ts`
- `apps/desktop/src/lib/model-providers.ts`
- `apps/desktop/src/lib/workspace.ts`
- `docs/FALTA_OPENBOT.md`
- `docs/MODELO_E_ESFORCO_POR_CHAT.md`
- `docs/_orq/codex-91-relatorio.md`

## Commits locais

- Implementação: `064ba60f7480970a8ac61651cf688c79947f36e5` — `feat(backend): esforço de raciocínio por conversa`; autor verificado: Jadson Reis `<jrdesign9@gmail.com>`, sem `Co-Authored-By`.
- Relatório incluído em commit local separado, depois do commit de implementação.

## Comandos rodados e resultados

Validações finais:

| Comando | Exit code | Resultado observado |
| --- | ---: | --- |
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | 0 | TypeScript sem erros. |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | 0 | 116 suítes passaram, 13 puladas; 594 testes passaram, 24 pulados (129 suítes e 618 testes no total). |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | 0 | TypeScript sem erros. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 42 arquivos passaram; 189 testes passaram. |
| `git diff --check` | 0 | Sem erros de whitespace. |
| `git diff --cached --check` | 0 | Sem erros de whitespace no conjunto selecionado para o commit. |
| Busca de padrões de segredo no diff staged | 0 | Zero ocorrências; a busca desconsiderou a chave de teste obviamente falsa `sk-falso-de-teste`. |
| Busca por `window.confirm`/`alert(` nos arquivos desktop indicados | 0 | Uma ocorrência antiga em `apps/desktop/src/App.tsx:2547` (`window.confirm` para remover provedor); essa linha não foi alterada nesta tarefa. Nenhuma ocorrência nova no diff. |

As primeiras rodadas completas apontaram expectativas antigas nos testes: backend exit 1 por três suítes (cinco testes) e desktop exit 1 por uma expectativa do campo `supportsEffort`. As expectativas foram corrigidas e as rodadas finais acima passaram. Nenhuma chamada real a provedor foi feita.

## Pendências

- Nenhuma pendência de implementação ou validação automatizada desta tarefa.
- A interface não foi exercitada visualmente no executável; a especificação dispensa teste de DOM e não houve chamada a provedor real.
