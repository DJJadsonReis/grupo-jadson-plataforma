# Modelo e esforço por chat

## Troca de IA por conversa

A escolha de provedor e modelo persistida por conversa, sua precedência sobre o agente e o comportamento de indisponibilidade estão documentados em [Troca de IA por conversa](TROCA_DE_IA_POR_CHAT.md).

Atualizado em 2026-11-20, tarefa 91 (Decisão 26, item 2).

## Comportamento

O nível é `baixo`, `medio` ou `alto` e fica salvo na coluna nullable `conversations.reasoning_effort`. `NULL` representa o padrão do provedor. A API `GET/PUT /api/v1/conversations/:id/reasoning-effort` aplica a mesma verificação de proprietário da conversa; valores fora da enumeração retornam 400 com mensagem fixa. O fluxo de chat também recebe o valor escolhido ao criar uma conversa nova e grava no servidor antes da chamada ao modelo.

O desktop mostra o seletor ao lado de **Modelo usado nesta conversa** somente quando o backend marca o modelo com `supportsEffort: true` em `/api/v1/model-providers/selectable`. O desktop não mantém uma lista própria de modelos compatíveis. Modelo não listado ou provedor sem suporte não recebe esforço; o valor salvo permanece na conversa para voltar a valer caso seja selecionado um modelo compatível.

## Compatibilidade explícita nesta versão

| Provedor | Modelos marcados | Parâmetro enviado |
| --- | --- | --- |
| OpenAI | `o1`, `o1-mini`, `o3`, `o3-mini`, `o4-mini` | `reasoning_effort`: `low`, `medium` ou `high` |
| Anthropic | `claude-sonnet-4-5` | `thinking: { type: "enabled", budget_tokens }`; baixo 1024, médio 4096, alto 8192. `max_tokens` é elevado para pelo menos orçamento + 1 quando necessário. |
| Google Gemini | `gemini-2.5-pro` | `thinkingConfig.thinkingBudget`: 1024, 4096 ou 8192. O tipo Gemini já está no catálogo gerenciado e usa a implementação compatível de `ProvidersService`; não foi criado provedor novo. |
| xAI | `grok-3-mini`, `grok-3` | `reasoning_effort`: `low`, `medium` ou `high`. O tipo xAI já está no catálogo gerenciado e usa a implementação compatível de `ProvidersService`; não foi criado provedor novo. |
| Personalizado e Ollama | nenhum | Sem suporte; o seletor fica oculto. |

Essas listas são uma allowlist conservadora no código (`apps/backend/src/modules/chat/model-effort.ts`): catálogo ou modelo desconhecido não implica suporte. O suporte não é descoberto por chamada externa.

## Interface e persistência

No composer do desktop, o seletor de esforço aparece ao lado do seletor de modelo e oferece **Padrão**, **Baixo**, **Médio** e **Alto**. A alteração persiste pela API. Ao selecionar modelo incompatível, o seletor some e a chamada não envia nível; o nível guardado não é apagado. Erros ao salvar aparecem discretamente no composer por alguns segundos.

## Tamanho por etapa

| Etapa | Escopo | Tamanho |
| --- | --- | --- |
| 1 | Lista positiva por provedor/modelo e tradução dos parâmetros OpenAI, Anthropic, Gemini e xAI | M |
| 2 | Migração nullable, leitura/gravação da API com autorização do proprietário e aplicação no chat | M |
| 3 | Seletor desktop guiado por `supportsEffort`, persistência por conversa e feedback de erro | P |
| 4 | Testes puros, testes de provedores, autorização, integração de chat e typecheck/testes completos | M |

## Tela de provedores (Decisão 28b)

A tarefa 91 não altera essa tela. O cadastro já mostra os provedores persistidos, com ações de adicionar, editar, testar e remover. O esforço é uma característica dos modelos no seletor do chat, não uma configuração de chave ou de provedor.
