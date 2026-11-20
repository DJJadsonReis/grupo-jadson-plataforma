# O que falta migrar do OpenBot

Data: 2026-11-12. Auditoria de status revisada em 2026-11-20 (leitura de código e testes; esforço por conversa atualizado na tarefa 91, troca de IA por conversa na tarefa 92, tela de provedores na tarefa 93 e servidor MCP na tarefa 94). Referência: `OpenBot/` (fora do Git, licença MIT, CopilotKit), conforme `docs/PLANO_MIGRACAO_REFERENCIAS.md`.

## Método e limites

- **OpenBot:** caminhos relativos a `OpenBot/`, conferidos no disco na auditoria de 2026-11-12.
- **Nosso lado:** conferido por leitura de código (`apps/backend/src`, `apps/desktop/src`, `apps/desktop/src-tauri`) e busca por palavras-chave. Em 2026-11-20 o backend foi testado: `jest --runInBand` com 71 suítes passando e 8 puladas (as que exigem PostgreSQL via `TEST_DATABASE_URL`); `tsc --noEmit` sem erros. Não rodei o app nem testei cada item na interface.
- **Status:**
  - **Feito:** existe no código e cobre o caso básico. A coluna "O que falta" pode listar lacunas que não impedem o uso básico.
  - **Parcial:** existe só em parte; a lacuna está descrita na coluna.
  - **Falta:** não encontrado no código.
- **Tipo** (só para o que falta):
  - **INTERNO:** dá para fazer só com código local.
  - **EXTERNO/PESADO:** depende de serviço de fora, publicação, conta, hardware, suporte do WebView ou esforço muito grande.
- **Tamanho:** P (até 2 dias), M (1 a 2 semanas), G (mais de 2 semanas ou depende de infraestrutura). Estimativa grosseira.
- **Fora da lista por decisão do dono** (`docs/_orq/decisoes.md`, decisões 9 e 11): assinatura de código e de instaladores do Windows, e telemetria transparente. Não são pendências.
- **Prioridade:** não foi reavaliada nesta revisão. A lista de 10 da seção de histórico abaixo é anterior a esta auditoria.

## Atualizado em 2026-11-20 (tarefa 83)

### Feito

- **Exclusão definitiva de conversa (tarefas 76–78):** servidor remove conversa e mensagens em `apps/backend/src/modules/chat/conversations.service.ts` (`remove`), expõe a rota em `apps/backend/src/modules/chat/conversations.controller.ts` e cobre a exclusão em `apps/backend/src/modules/chat/conversations.pg.spec.ts`. No desktop, `apps/desktop/src/lib/conversation-list.ts` (`planConversationDeletion`) e `apps/desktop/src/App.tsx` atualizam a lista e o histórico local.
- **Disponibilidade de modelo (tarefa 79):** `apps/backend/src/modules/providers/model-providers.service.ts` (`checkModels`, `assertAvailable`) e `apps/backend/src/modules/providers/model-providers.service.spec.ts`.
- **Escalonamento para pessoa / fila humana (tarefa 80):** `apps/backend/src/modules/human-support/human-support.service.ts` (`claim`, `resolve`) e `apps/backend/src/modules/human-support/human-support.service.spec.ts`.
- **Token único app-backend (tarefa 81, commit `83d89d1`):** implementado no código. A reprodução no PC está pendente (ação do dono).
- **Esforço por conversa (tarefa 91):** valores baixo/médio/alto persistidos por conversa, suporte explícito por modelo no backend, parâmetros por provedor, seletor desktop condicionado a `supportsEffort` e fluxo de chat coberto. Evidências: `docs/MODELO_E_ESFORCO_POR_CHAT.md`, `apps/backend/src/modules/chat/model-effort.ts`, `apps/backend/src/modules/database/migrations/044-conversation-effort.ts`, `apps/backend/src/modules/chat/effort.e2e.spec.ts` e `apps/desktop/src/lib/conversation-effort.test.ts`.
- **Troca de IA por conversa (tarefa 92):** escolha de provedor/modelo salva no servidor, precedência sobre agente e fallback quando indisponível. Evidências: `docs/TROCA_DE_IA_POR_CHAT.md`, `apps/backend/src/modules/database/migrations/045-conversation-model.ts`, `apps/backend/src/modules/chat/conversations.controller.ts`, `apps/backend/src/modules/chat/conversation-model.e2e.spec.ts` e `apps/desktop/src/lib/conversation-model.test.ts`.
- **Tela de provedores com lista sempre visível (tarefa 93):** status por chave, data do último teste, contagem de modelos, formulário independente e diálogo de remoção. Evidências: `apps/backend/src/modules/database/migrations/046-provider-test-status.ts`, `apps/backend/src/modules/providers/provider-key-status.ts`, `apps/backend/src/modules/providers/model-providers.service.ts`, `apps/backend/src/modules/providers/provider-status.e2e.spec.ts`, `apps/desktop/src/lib/provider-status.ts` e `apps/desktop/src/App.tsx` (`ModelsPage`).
- **Servidor MCP do Grupo Jadson (tarefa 94):** transporte HTTP JSON-RPC com tokens individuais revogáveis, ferramentas limitadas às tarefas, memória, agentes, rotinas, notificações e status, recursos de agentes visíveis e prompts fixos. Evidências: `apps/backend/src/modules/mcp-server/`, migration `047-mcp-server-tokens`, painel `apps/desktop/src/components/mcp/McpAccessPanel.tsx` e `docs/MCP_GRUPO_JADSON.md`. O cliente MCP de terceiros continua em `apps/backend/src/modules/mcp/` e `apps/desktop/src/components/mcp/McpServersPanel.tsx`.

### Parcial

- **Ditado por voz (entrada):** a propagação da causa real da tarefa 81 está Feita no código; o recurso continua Parcial até a reprodução autenticada no exe. Nesta sessão, `setup.json` estava ausente, então essa reprodução está pendente (ação do dono). Evidências: `apps/backend/src/modules/dictation/dictation.service.ts`, `apps/desktop/src/lib/dictation-session.ts` e `apps/desktop/src/lib/dictation-api.ts`.
- **Mascaramento de segredos em saídas e logs:** permanece Parcial; mascarar segredos nos logs é o item 8 da fila.

### Fila autorizada

Decisão 29, na ordem obrigatória:

1. **Modos de operação por conversa/agente** (Decisão 27) — Feito nesta tarefa 85: backend aplica os cinco modos, persistência por conversa/padrão de agente, seletor no composer e confirmação/auditoria admin. Evidência: `docs/MODOS_DE_OPERACAO.md`; testes `operation-modes.spec.ts` e `conversations.controller.spec.ts`.
6. **Design no estilo Grok com revisão de textos** (Decisões 23 e 23b), mantendo a marca do Grupo Jadson — INTERNO.

Depois dos itens 1–6, Decisão 30:

7. **Limpeza da auditoria (retenção)** — INTERNO, P.
8. **Mascarar segredos nos logs** — INTERNO, P, Parcial.
10. **Handoff geral entre bots** — INTERNO, M.
11. **Agente próprio por endpoint (AG-UI)** — INTERNO, M.
12. **Tarefas e fila de trabalho integrada** — INTERNO, M.
13. **Painel administrativo completo** — INTERNO, M.
14. **Tela de status e encerramento ordenado** — INTERNO, P.
15. **Gráficos interativos e galeria de componentes** — INTERNO, G.
16. **Check-ins proativos** — INTERNO, G.

Nenhum item EXTERNO/PESADO está nesta fila.

### Mapeado, sem autorização para implementar

- **Modo de chamada por voz no controlador** — INTERNO, tamanho M. Partes: serviço de voz comum (M); sessão de chamada (P); transcrição contínua com fim de fala (G); resposta em streaming (M); síntese por provedor configurado (M); interrupção falando por cima (G); telas desktop e web-admin (M).
## Tabela

### Mapeamento futuro

| Funcionalidade | Refer?ncia | Status | Evid?ncia | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Modo de chamada por voz no controlador | Decisões 21 e 22 | Mapeado, não autorizado para implementar | Mapeamento no topo deste documento | Serviço comum, sessão, transcrição contínua com fim de fala, resposta em streaming, síntese por provedor, interrupção e telas desktop/web-admin | INTERNO | M |

### Bots e agentes

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Bots com perfil durável (criar, editar, ligar/desligar) | `server/src/agents/profile-store.ts` | Feito | `apps/backend/src/modules/agents/agents.service.ts` (CRUD persistido) | — | — | — |
| Grupos com vários bots numa conversa | `server/src/channels/group.ts` | Feito | `apps/backend/src/modules/agents/groups.service.ts`, `apps/desktop/src/lib/groups.ts` | — | — | — |
| Handoff e subagentes entre bots | `server/src/agents/handoff*.ts`, `subagent.ts` | Parcial | `apps/backend/src/modules/chat/subagents.service.ts` (até 3 subagentes por turno) | Handoff geral entre bots além da ferramenta de subagente | INTERNO | M |
| Escalonamento para pessoa | `server/src/agents/escalation.ts` | Feito | `apps/backend/src/modules/human-support/human-support.service.ts` (`claim`, `resolve`), `apps/backend/src/modules/human-support/human-support.service.spec.ts` | — | — | — |
| Trazer agente próprio (AG-UI ou endpoint) | `server/src/agents/endpoint.ts`, `registry.ts` | Parcial | `apps/backend/src/modules/agents/agent-endpoint.ts` (endpoint HTTPS; 30 s; 64 KB) | Protocolo AG-UI e registro de endpoints | INTERNO | M |
| Compartilhar bot com pessoas e times | `server/src/team-bots/`, `server/src/people/` | Feito | `apps/backend/src/modules/agents/agent-permissions.service.ts`, `apps/desktop/src/lib/agent-access.ts` | — | — | — |
| Alcance do bot (onde a pessoa pode falar com ele) | `reachability.tsx`, `bots.$agentId.reach.tsx` | Falta | Não encontrado | Canais de entrega fora do app, que ainda não existem | EXTERNO/PESADO | G |

### Conversa e interface

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Respostas em streaming | `server/src/channels/socket.ts`, `events.ts` | Feito | `apps/backend/src/modules/chat/chat.controller.ts` (SSE), `apps/backend/src/common/masked-text-stream.ts` | — | — | — |
| Título de conversa gerado automaticamente | `server/src/channels/titler.ts` | Feito | `apps/backend/src/modules/chat/conversation-title.ts` (após a 1ª resposta, máx. 48 tokens) | — | — | — |
| Prévia de conversa sem markdown | `server/src/channels/summary.ts` | Feito | `apps/desktop/src/lib/preview.ts` | — | — | — |
| Exclusão definitiva de conversa | `server/src/channels/conversations.ts` | Feito | `apps/backend/src/modules/chat/conversations.service.ts` (`remove`), `apps/backend/src/modules/chat/conversations.controller.ts`, `apps/backend/src/modules/chat/conversations.pg.spec.ts`; `apps/desktop/src/lib/conversation-list.ts` (`planConversationDeletion`) e `apps/desktop/src/App.tsx` | — | — | — |
| Anexos de imagem | `server/src/channels/attachments.ts`, `shared/attachment-mime.ts` | Feito | `apps/backend/src/modules/chat/image-attachments.ts` (limite de 5 MB por mensagem) | — | — | — |
| Anexos de documentos (DOCX, XLSX) | `shared/attachments.ts`, `attachment-parts.ts` | Feito | `apps/backend/src/modules/documents/office-text.ts`, `apps/backend/src/modules/documents/office-zip.ts` (DOCX e XLSX) | — | — | — |
| Respostas com componentes ricos | `server/src/components/`; `components-gallery` | Parcial | `apps/desktop/src/components/RichComponent.tsx` (cartão, tabela, barras) | Gráficos interativos e galeria de componentes | INTERNO | G |
| Imagens geradas por ferramentas | `server/src/tool-images.ts` | Falta | Não encontrado | Geração local ou serviço externo de geração de imagem | EXTERNO/PESADO | M |
| Ditado por voz (entrada) | `server/src/dictation/`, `shared/on-device-speech.ts` | Parcial | `apps/backend/src/modules/dictation/transcriber.ts` (Whisper local pt; modelo sob demanda), `apps/desktop/src/lib/dictation-session.ts` (parciais e controles) | Reprodução autenticada no exe com token do app (ação do dono) | INTERNO | P |
| Leitura da resposta em voz alta | `server/src/voice/`, `shared/voice-session.ts` | Feito | `apps/desktop/src/lib/read-aloud.ts`, `apps/desktop/src/App.tsx` (speechSynthesis) | Depende de voz pt-BR instalada no WebView | — | — |
| Tour inicial e dicas | `start.$startId.tsx`, `shared/starter-tour.ts` | Feito | `apps/desktop/src/lib/starter-tour.ts` | — | — | — |

### Ferramentas e segurança

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Telemetria transparente | Decisão 11 | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Registro de ferramentas com nível de risco | `server/src/plugins/tools.ts` | Feito | `apps/backend/src/modules/tools/tools.registry.ts` | — | — | — |
| Busca de ferramentas quando há muitas | `shared/tool-search.ts`, `agents/tool-search.ts` | Feito | `apps/backend/src/modules/tools/tool-search.ts`, usada em `apps/backend/src/modules/chat/chat.controller.ts` | — | — | — |
| Limite de ferramentas por turno | `server/src/agents/tool-limit.ts` | Feito | `apps/backend/src/modules/chat/subagents.service.ts` (máx. 4 iterações e 3 subagentes) | — | — | — |
| Aprovação humana antes de ação sensível | `server/src/approvals/`; `docs/approvals.md` | Feito | `apps/backend/src/modules/audit/approvals.service.ts`, `apps/backend/src/modules/tools/tools.approval.spec.ts` | — | — | — |
| Trilha de auditoria | `server/src/audit.ts` | Feito | `apps/backend/src/modules/audit/audit.service.ts` | — | — | — |
| Retenção e limpeza da auditoria | `server/src/audit-retention.ts` | Parcial | `apps/backend/src/modules/audit/audit.service.ts` (retenção configurável, lotes e advisory lock) | Sem tela de configuração | INTERNO | P |
| Tratamento de conteúdo não confiável (contra injeção) | `server/src/untrusted-content.ts` | Feito | `apps/backend/src/modules/tools/untrusted-content.ts`, `apps/backend/src/modules/chat/chat.controller.ts` | — | — | — |
| Mascaramento de segredos em saídas e logs | `agent-computer/src/secret-masking.ts` | Parcial | `apps/backend/src/common/secret-masking.ts`, `apps/backend/src/common/masked-text-stream.ts` | Formatos proprietários sem valor conhecido não são detectados | INTERNO | P |
| Assinar requisições de navegação (web-bot-auth) | `server/src/web-bot-auth.ts` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |

### Computador e navegador do bot

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Navegador próprio do bot em contêiner, com tela ao vivo | `agent-computer/src/browser-host.ts`, `screencast.ts`; `supervisor/` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Navegador em contêiner e login assistido | `agent-computer/src/sign-in.ts`, `viewer.ts` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Pasta de trabalho do bot | `agent-computer/src/workspace.ts` | Feito | `apps/backend/src/modules/tools/workspace-files.ts` (listar, ler e escrever com aprovação) | — | — | — |
| Gravar uma demonstração no navegador | `extension/`; `agent-computer/src/recorder.ts` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Extensão do navegador | `extension/` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |

### Plugins e integrações

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Servidores MCP (cliente) | `server/src/plugins/mcp.ts` | Feito | `apps/backend/src/modules/mcp/mcp.service.ts` (stdio, Streamable HTTP e SSE); `apps/desktop/src/components/mcp/McpServersPanel.tsx` | Nenhuma lacuna interna conhecida | — | — |
| Servidor MCP da plataforma | Decisão 24 | Feito | `apps/backend/src/modules/mcp-server/`, migration `047-mcp-server-tokens`, `apps/desktop/src/components/mcp/McpAccessPanel.tsx`, `docs/MCP_GRUPO_JADSON.md` | Stdio, conversa com agente, Google Drive/Docs e escrita de rotinas estão fora desta etapa | — | — |
| Catálogo de conectores (Composio, Arcade) | `server/src/plugins/composio.ts`, `arcade.ts` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Google Agenda e Drive | `server/src/plugins/google-drive-rest.ts` | Feito | `apps/backend/src/modules/google/google.service.ts` e `apps/backend/src/modules/tools/tools.registry.ts` (agenda e criação de Google Doc com aprovação) | — | — | — |
| Notion | `docs/plugins/notion.md` | Feito | `apps/backend/src/modules/tools/notion.ts` (buscar, ler, criar página e anexar texto) | — | — | — |
| Compartilhar conexões entre pessoas | `server/src/plugins/shared-accounts.ts` | Feito | `apps/backend/src/modules/connection-shares/connection-shares.service.ts`, `apps/desktop/src/components/connections/ConnectionSharesPanel.tsx` | — | — | — |
| Cofre de credenciais | `server/src/credentials.ts` | Feito | `apps/backend/src/modules/integrations/secret-box.ts`, `apps/backend/src/modules/integrations/integrations.service.ts` | — | — | — |

### Rotinas e proatividade

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Rotinas agendadas | `server/src/routines/schedule.ts`, `runner.ts` | Feito | `apps/backend/src/modules/routines/routines.service.ts` (agenda, persistência e claim) | — | — | — |
| Responsabilidades contínuas | `server/src/responsibilities/` | Feito | `apps/backend/src/modules/responsibilities/responsibilities.service.ts`, `apps/desktop/src/components/responsibilities/ResponsibilitiesPage.tsx` | — | — | — |
| Check-ins proativos | `server/src/proactive/`; `mobile/src/check-ins.tsx` | Falta | Não encontrado | Mensagens iniciadas pelo bot dentro do app | INTERNO | G |
| Notificações | `server/src/delivery/` | Feito | `apps/backend/src/modules/notifications/notifications.service.ts`, `apps/desktop/src/components/notifications/NotificationsPanel.tsx` | Entrega ao celular não existe (app móvel CORTADO) | — | — |
| Tarefas e fila de trabalho | `server/src/tasks/`, `server/src/work/` | Autorizado / na fila (Decisão 30) | `apps/backend/src/modules/tasks/tasks.service.ts`, `apps/desktop/src/components/tasks/TasksPage.tsx` | Fila de trabalho integrada (`work/`) | INTERNO | M |
| Aplicativo móvel | `mobile/` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |

### Memória, preferências e aprendizado

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Memória por pessoa (lembrar, listar, apagar) | `server/src/memory/` | Feito | `apps/backend/src/modules/memory/memory.service.ts`, `apps/backend/src/modules/tools/tools.registry.ts` | — | — | — |
| Preferências e instruções do usuário | `server/src/user-preferences.ts` | Feito | `apps/backend/src/modules/preferences/user-preferences.service.ts`, `apps/desktop/src/components/preferences/PreferencesPanel.tsx` | — | — | — |
| Habilidades reutilizáveis (skills) | `server/src/plugins/route-groups/skills.ts` | Feito | `apps/backend/src/modules/skills/skills.service.ts`, `apps/desktop/src/components/skills/SkillsPage.tsx` | — | — | — |
| Aprendizado automático compartilhado (Learning) | `server/src/learning/` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |

### Pesquisa na web

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Busca na web paga | `shared/research.ts` | CORTADO | Decisão do dono, 2026-11-20 | CORTADO por decisão do dono, 2026-11-20 | — | — |
| Leitura do conteúdo de uma página | `shared/research.ts` | Feito | `apps/backend/src/modules/tools/page-reader.ts` (leitura com pinagem ao IP validado e bloqueio de endereços privados) | Sem teste contra a internet real | — | — |
| Busca web gratuita (Wikipédia) | `shared/research.ts` | Feito | `apps/backend/src/modules/tools/web-search.ts` | — | — | — |

### Modelos e custos

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Provedores de modelo | `shared/model-providers.json`; `server/src/model-catalogue.ts` | Feito | `apps/backend/src/modules/providers/model-providers.service.ts` (chaves múltiplas, descoberta de modelos) e `apps/desktop/src/App.tsx` (cadastro/teste) | — | — | — |
| Esforço de raciocínio por conversa | Decisão 26, item 2 | Feito | `apps/backend/src/modules/chat/model-effort.ts`, `apps/backend/src/modules/database/migrations/044-conversation-effort.ts`, `apps/backend/src/modules/chat/effort.e2e.spec.ts`, `apps/desktop/src/lib/conversation-effort.ts` | — | — | — |
| Anthropic | `shared/model-providers.json` | Feito | `apps/backend/src/modules/providers/anthropic.provider.ts` (Messages API, tool_use, SSE) | API real não testada | — | — |
| Checagem de disponibilidade e rejeição de modelo | `server/src/model-availability-check.ts` | Feito | `apps/backend/src/modules/providers/model-providers.service.ts` (`checkModels`, `assertAvailable`), `apps/backend/src/modules/providers/model-providers.service.spec.ts` | — | — | — |
| Medição de uso e custo | `server/src/model-billing.ts` | Feito | `apps/backend/src/modules/database/migrations/043-model-prices.ts`, `apps/backend/src/modules/chat/model-prices.ts`, `apps/backend/src/modules/chat/usage.service.ts`, `apps/backend/src/modules/chat/usage.controller.ts`, `apps/desktop/src/lib/usage-prices.ts`, `apps/desktop/src/App.tsx` | Nenhum modelo tem preço até o admin cadastrar; o cadastro é feito pela própria tela de uso. | — | — |
| Entrar com Google ou xAI (OAuth do provedor) | `server/src/provider-oauth.ts` | Falta | Não encontrado | OAuth dos provedores; contas e apps externos | EXTERNO/PESADO | G |

### Pessoas, acesso e administração

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Entrada por provedor de identidade (OIDC) | `server/src/identity/` | Feito | `apps/backend/src/modules/auth/oidc.service.ts`, `apps/desktop/src/App.tsx` (login Google e configurações de provedores) | — | — | — |
| Papéis e usuários | `server/src/people/`, `server/src/passwords/` | Feito | `apps/backend/src/modules/auth/roles.ts`, `apps/backend/src/modules/auth/users.service.ts` | — | — | — |
| Modo pessoal, sem login | `server/src/edition.ts` | Feito | `apps/backend/src/common/edition.ts`, `apps/backend/src/common/personal-edition.guard.ts`, `apps/desktop/src/lib/edition.ts` | — | — | — |
| Painel administrativo | `app/src/routes/_authed/admin/*` | Parcial | `apps/desktop/src/App.tsx` (configurações, uso, acessos e provedores) | Administração não cobre todos os recursos e fluxos de equipe | INTERNO | M |

### Aplicativo desktop e instalação

| Funcionalidade | Referência OpenBot | Status | Evidência no nosso código | O que falta | Tipo | Tamanho |
|---|---|---|---|---|---|---|
| Atualização automática do app | `desktop/src/UpdateOffer.tsx`; `docs/desktop-updates.md` | Parcial | `apps/desktop/src/lib/updates.ts`, `apps/desktop/src-tauri/tauri.conf.json` | Configurar repositório público de releases e publicar manifesto e artefatos | EXTERNO/PESADO | P |
| Primeira execução guiada | `desktop/src/Welcome.tsx`, `SetupProgress.tsx`; `server/src/setup/` | Feito | `apps/desktop/src/Welcome.tsx`, `apps/desktop/src-tauri/src/lib.rs` (instala PostgreSQL portátil com confirmação; início de serviços também confirmado) | — | — | — |
| Verificação de requisitos do Windows | `desktop/src/WindowsBlocker.tsx` | Feito | `apps/desktop/src/lib/windows-requirements.ts`, `apps/desktop/src/Welcome.tsx` | — | — | — |
| Tela de status e encerramento | `desktop/src/StatusWindow.tsx`, `ShuttingDown.tsx` | Parcial | `apps/desktop/src/components/status/StatusPanel.tsx` | Encerramento ordenado dos serviços locais pelo app | INTERNO | P |

## Resumo da tabela

- **Total:** 68 linhas de funcionalidade, incluindo a linha de mapeamento futuro e a troca de IA por conversa concluída na tarefa 92.
- **Feito:** 44; **Parcial:** 9; **Falta:** 4; **CORTADO:** 10; **Mapeado, não autorizado:** 1; **Autorizado / na fila:** 0. Os próximos itens autorizados seguem listados na fila; esforço por conversa foi concluído na tarefa 91, troca de IA por conversa na tarefa 92 e MCP server na tarefa 94.
- A fila autorizada está no topo deste documento; itens EXTERNO/PESADO que permanecem na tabela são apenas referência.
## Histórico anterior à auditoria de 2026-11-20

As seções abaixo são o registro de rodadas anteriores, mantido como histórico. Onde conflitarem com a tabela acima, vale a tabela.

## As 10 próximas a implementar

Ordem de prioridade. Todos podem ser feitos sem serviço pago.

1. **Tratamento de conteúdo não confiável (contra injeção de instruções).** Implementado: resultados externos entram envelopados no loop de ferramentas e `UNTRUSTED_GUIDANCE` orienta o modelo; mensagens de sistema do cliente são descartadas. Referência: `server/src/untrusted-content.ts`. Esforço M.
2. **Atualização automática do app.** Parcialmente implementado: plugin oficial do Tauri 2.14.1, checagem, aviso e instalação. O commit `0c45472` alterou `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock` e `pnpm-lock.yaml`, conforme autorização explícita. A chave privada fica fora do repositório; o endpoint segue como exemplo `.invalid`. **Não concluído:** falta configurar um endpoint HTTPS real e publicar manifestos/artefatos; a compilação Rust integral não foi validada na rodada da primeira execução guiada (o `cargo check` falhou por cache offline ausente para `tauri-plugin-opener`). Referência: `docs/desktop-updates.md`. Esforço M.
3. **Primeira execução guiada.** Parcialmente implementada: a tela detecta backend, PostgreSQL, pgvector e Redis; salva a URL PostgreSQL e um token de sistema aleatório no perfil local do Windows; explica como iniciar e revalidar. Redis não bloqueia quando a fila em memória está selecionada. Ainda é necessário iniciar/reiniciar manualmente o backend e disponibilizar o PostgreSQL; o desktop não instala nem gerencia esses serviços. Referência: `desktop/src/Welcome.tsx`, `server/src/setup/`. Esforço M.
4. **Rotinas com agendamento real.** Feito (básico): intervalo ou horário diário fixo e continuidade após reiniciar pelo próximo disparo persistido. Esforço M.
5. **Leitura do conteúdo de uma página.** Sem isso o agente só vê trechos de busca. Pode usar `fetch` e extração de texto, sem chave paga. Referência: `shared/research.ts`. Esforço M.
6. **Limite de ferramentas por turno.** Evita laços caros e respostas sem fim, o que importa com verba zero. Referência: `server/src/agents/tool-limit.ts`. Esforço P.
7. **Mascaramento de segredos em saídas e logs.** Evita que uma chave apareça na conversa ou no log. Custo baixo, ganho de segurança alto. Referência: `agent-computer/src/secret-masking.ts`. Esforço P.
8. **Preferências do usuário e memória com opt-out.** Dá controle sobre o que é lembrado, e cada pessoa decide. Referência: `server/src/user-preferences.ts`, `memory/`. Esforço P a M.
9. **Compartilhar bot com pessoas e times.** Implementado (básico). Modelo aprovado em `docs/PROPOSTA_COMPARTILHAMENTO_BOTS.md`: times só por administradores globais; editor de time pode editar bots; bots existentes mantêm dono `sistema`; conversas e memórias não são compartilhadas. Migration/serviço e API aplicam acesso por proprietário, concessão direta ou time; a API filtra bots, protege uso no chat, edição, exclusão, memberships e compartilhamentos. Conversas existentes ficam no principal `sistema`; conversas novas e mensagens ficam isoladas por principal, assim como memória. A interface permite compartilhar/revogar acesso direto ou por time, escolher papel, e administrar times e membros nas configurações de acesso. Referência: `server/src/team-bots/`, `server/src/people/`. Esforço M.
10. **Ditado por voz (entrada).** Parcialmente implementado: o campo de mensagem mostra o microfone, estado de escuta e erros. Só inicia reconhecimento Web Speech quando o WebView confirma processamento local; não usa fallback remoto nem envia áudio ao backend. Se necessário, o clique prepara/baixa o pacote local pt-BR; depois a pessoa clica de novo para iniciar a captura. Requer suporte `processLocally` e pacote disponível no dispositivo. Referência: `server/src/dictation/`, `shared/on-device-speech.ts`. Esforço M.

**Registro histórico do item 1 (2026-11-19):** a primeira alteração introduziu o envelope `untrusted_data`; naquele momento o loop ainda não existia e os testes não haviam sido executados. O loop e a guidance foram implementados e validados depois, conforme a seção “Implementação do loop” abaixo; o estado inicial deste registro foi superado.

**Atualização (2026-11-19):** `tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --version` retornou `9.15.0`; o Node do PATH retornou `v24.14.0`, e a toolchain local exigida (Node 22 em `tools/node/node.exe`) não está presente. `pnpm install --offline` abriu o prompt de remoção e reinstalação dos diretórios `node_modules`; a operação não foi confirmada, portanto a instalação não ocorreu. `pnpm-lock.yaml` permaneceu sem alteração. Em tentativa anterior, `npx jest --runInBand src/modules/tools` falhou porque `apps/backend/node_modules/jest/bin/jest.js` não existe; `node_modules/.bin/tsc --noEmit` falhou porque `apps/backend/node_modules/typescript/bin/tsc` não existe. Nenhum teste ou typecheck passou. É necessário decidir se autoriza prosseguir com a reinstalação que remove os `node_modules` atuais.

**Prompt contra conteúdo não confiável:** `chat.controller.ts` inclui `UNTRUSTED_GUIDANCE` como mensagem de sistema. A ordem intencionada é instruções persistidas do agente primeiro e orientação de segurança em seguida; mensagens de sistema enviadas pelo cliente são descartadas. Essa alteração ainda não foi validada por teste/typecheck.

**Loop de ferramentas:** leitura de `chat.controller.ts`, `provider.types.ts`, `providers.service.ts`, `openai.provider.ts` e `tools.registry.ts` confirmou que o chat faz apenas uma chamada simples `providers.stream`; `CompletionInput` não declara ferramentas e o stream não trata `tool_calls`. Portanto, nenhum resultado de ferramenta retorna ao modelo hoje. A tarefa de fechar o loop foi interrompida conforme instrução, sem inventar protocolo/loop; testes do caminho novo não foram adicionados porque o caminho não existe.

**Por que essa ordem:** os quatro primeiros cobrem segurança, manutenção e primeira experiência, que são os riscos mais altos para um app já distribuído. Os itens 5 a 8 aumentam o que o bot consegue fazer com pouco custo. Os itens 9 e 10 ampliam o uso.

**Fora da lista de 10, de propósito:** computador do bot em contêiner (G, exige Docker e manutenção de contêineres), catálogo de conectores Composio e Arcade (serviços de terceiros, com planos pagos a verificar), Learning (depende do serviço Intelligence, com plano gratuito a verificar e licença própria), aplicativo móvel (G) e responsabilidades contínuas (G, depende de rotinas e check-ins).

**Andamento do item 7 (2026-11-19):** implementado mascarador próprio em `apps/backend/src/common/secret-masking.ts`, com marcador `[REDACTED]` e mínimo de 8 caracteres para valores conhecidos/padrões. Lê sem escrita e mantém em memória somente durante a sanitização valores de `tavily`, `notion` e `modelo_chave` das integrações, além de variáveis de ambiente com nomes de chave/token/segredo/senha/URLs de conexão. Aplicado a valores e erros de ferramentas antes de persistir/devolver, ao texto final do modelo antes de enviar/persistir, aos erros enviados de volta ao modelo e aos logs que interpolam erros em chat, rotinas, banco, Redis, MCP e OIDC. Falhas de conexão do provider retornam mensagem genérica. A entrada escrita pelo usuário não é alterada.

**Validação do item 7 (2026-11-19):** `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand` → exit 0, 28 suítes e 119 testes passando. `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec tsc --noEmit` → exit 0. Os testes focados passaram antes: 4 suítes, 20 testes. Padrões cobertos incluem tokens de provedores, Bearer, JWT, chaves de API, tokens GitHub/Slack, credenciais em URL e parâmetros comuns de token/chave. Formatos proprietários sem valor conhecido não são reconhecidos; tokens codificados/transformados e valores conhecidos menores que 8 caracteres ficam fora do mascaramento deliberadamente. Nenhum teste usou credencial externa real.

## Licenças e cuidados

- O OpenBot é MIT, copyright CopilotKit (2026). Qualquer trecho copiado deve manter o aviso em `THIRD_PARTY_NOTICES.md`, que já traz a seção do OpenBot com a cópia integral da licença.
- **Não copiar** `shared/marks/` (logos de fornecedores), nem `.env`, chaves ou `.env.openbot-installation-id`.
- **Padrão, não cópia:** para a maioria dos itens recomenda-se reimplementar a ideia com o nosso stack (NestJS, Tauri, React 18). Se algum trecho for copiado, registrar em `THIRD_PARTY_NOTICES.md` antes do commit.
- Dependências novas: verificar a licença antes de adicionar (regra do plano de migração).

**Validação (2026-11-19, após instalação autorizada):** `CI=true pnpm install --frozen-lockfile --ignore-scripts` (pnpm 9.15.0, Node v24.14.0, sem alterar o lockfile) concluiu com exit 0. `apps/backend`: `jest --runInBand src/modules/tools src/modules/chat` → 9 suítes, 35 testes, todos passando (inclui `untrusted-content.spec.ts`). `tsc --noEmit` → exit 0. Alteração em `chat.controller.ts` (ordem da política) validada por inspeção; sem teste específico ainda. O Node 22 do projeto não está em `tools/node`; a validação usou Node 24.

**Retificação de estado:** os parágrafos anteriores registram etapas anteriores; implementação e validação atualizadas estão abaixo.

**Implementação do loop (2026-11-19):** contrato `CompletionInput.tools` e encaminhamento OpenAI-compatible com `tool_choice: "auto"`; o parser junta fragments SSE de `tool_calls`, e o chat executa até quatro ciclos via `ToolsService.invoke`. A cada ferramenta o modelo recebe uma mensagem `role: "tool"` com `tool_call_id`. Apenas ferramentas `read` são oferecidas, com aliases de ponto para sublinhado duplo e schemas de argumentos do registro. Uma chamada sensível inesperada é invocada sem regra `allow` do agente para garantir que fique `pending_approval`; ao modelo retorna apenas `{"status":"aguardando aprovação"}`. No quinto pedido de ciclo, o chat devolve mensagem clara de limite. O envelope de objetos continua no campo `untrusted`; saídas externas primitivas/listas são envelopadas como texto. Mensagens de sistema do cliente são descartadas; ordem dos prompts é instruções persistidas do agente e depois `UNTRUSTED_GUIDANCE`.

**Validação desta implementação (2026-11-19):** `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand` → exit 0, 26 suítes e 109 testes passando. `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec tsc --noEmit` → exit 0. Os testes incluem resultado externo envelopado retornado ao modelo, limite de ciclos, aprovação sensível, descarte de system do cliente, ordem da política e envio/repasse de tool calls pelo provider. Não foram testadas chamadas reais a serviços externos nem modelos com credenciais reais. `pnpm-lock.yaml` e manifests de dependências não foram alterados.

**Streaming com mascaramento (2026-11-19):** a resposta final volta a ser exibida durante a geração. `apps/backend/src/common/masked-text-stream.ts` segura uma janela de 512 caracteres e libera o texto só até o último espaço, mascarado; um segredo nunca é cortado entre pedaços. Rodada com chamada de ferramenta descarta o buffer. `[DONE]` é escrito uma única vez, no fim. Limite conhecido: valor de segredo conhecido que contenha espaço pode ser cortado; nenhum padrão de provedor tem espaço, exceto `Bearer`, tratado. Texto anterior a uma chamada de ferramenta na mesma rodada pode já ter sido exibido, mascarado.
Validação: jest completo em apps/backend com 29 suítes e 126 testes, exit 0; `tsc --noEmit`, exit 0.

**Andamento do item 5 (2026-11-19):** ferramenta pública `pagina.ler` adicionada ao registro e executada por `pinnedFetch` (conexão ao IP validado), sem chave. Aceita HTTP/HTTPS sem credenciais na URL; bloqueia hostnames locais (`localhost`, `.localhost`, `.local`), IPs IPv4 privados/loopback/link-local/reservados e IPv6 locais, e recusa DNS com qualquer endereço privado. Redirecionamentos são manuais, limitados a três e revalidados. Só aceita HTML/XHTML/texto, corta tags de script/style/etc., lê no máximo 1.000.000 bytes em fluxo, limita texto extraído a 20.000 caracteres e usa timeout de 8 segundos. Texto retorna também em `untrusted_data`. **Corrigido:** a conexão usa o IP validado (`pinnedFetch`), sem nova resolução DNS. Teste de pinagem com `rebind.invalid` em `page-reader.spec.ts`. Não há chamada real à internet.; portanto não elimina DNS rebinding. Não foi feita chamada real à internet.

**Validação do item 5 (2026-11-19):** `jest --runInBand src/modules/tools/page-reader.spec.ts` → exit 0, 1 suíte e 12 testes. Typecheck final → exit 0.

**Andamento do item 4 (2026-11-19):** `routines.next_run_at` é persistido no PostgreSQL. O `setInterval` fixo foi substituído por um timer único calculado a partir do próximo disparo salvo; na inicialização vencidas são agendadas imediatamente, e mudanças/criação/execução rearmam o timer. **Parcial:** não há claim distribuído/transação de disparo, então múltiplas instâncias podem executar a mesma rotina; a fila atual pode ser em memória ou Redis, e rotinas não a usam.

**Validação do item 4 (2026-11-19):** `jest --runInBand src/modules/routines/routines.service.spec.ts` → exit 0, 1 suíte e 12 testes; inclui consulta de vencidas e status de execução. Não simula reinicialização de processo nem concorrência entre instâncias. Typecheck final → exit 0.

**Andamento do item 8 (2026-11-19):** uso existente de `memory_preferences` conectado ao principal autenticado na API de memória, nas consultas de contexto do chat e na listagem pela ferramenta. `remember()` agora recusa gravação quando opt-out estiver desligado. A configuração continua no escopo de cada pessoa e o texto da conversa do usuário não é modificado. **Pendente:** preferências gerais/instruções personalizadas ainda não existem; nenhuma UI nova foi incluída.

**Validação do item 8 (2026-11-19):** `memory.service.spec.ts` cobre que memória desligada não grava e outra pessoa continua podendo gravar; `chat.controller.spec.ts` verifica que o contexto usa o ID autenticado. Os dois passaram no Jest completo. Typecheck final → exit 0.

**Validação completa desta rodada (2026-11-19):** `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand` → exit 0, 30 suítes e 141 testes. `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec tsc --noEmit` → exit 0. `git diff --check` → exit 0. Sem instalação de dependências; lockfile e manifests não foram alterados.

## Fechamento de itens autocontidos (2026-11-19, base 84d7c5a)

**Item 1 — claim distribuído de rotinas:** cada rotina vencida é reclamada por uma atualização atômica com `FOR UPDATE SKIP LOCKED`, token de claim e lease de 5 minutos; a conclusão só limpa lease/avança o próximo disparo se o token ainda for o da execução. Migration `018-routine-claims` adiciona as colunas em bancos que já executaram a migration de rotinas. A lease permite nova tentativa após crash. Teste com duas instâncias e banco dublado confirma uma única chamada à ferramenta. Validado depois contra PostgreSQL 16 (binários embutidos em tools/pg, cluster descartável na porta 55432): migrações 001–018 aplicadas, colunas claim_until/claim_token presentes e o teste `routines.pg.spec.ts` (duas instâncias concorrentes, uma execução) passou. Ativado com TEST_DATABASE_URL.

**Item 2 — retenção de auditoria:** `AUDIT_RETENTION_DAYS` configura a retenção (desligada se ausente/inválida); varredura ao boot e de hora em hora, lotes até 500, até 100 lotes por passagem e advisory lock transacional. `audit_events` relacionados a aprovações pendentes são excluídos do conjunto; `approvals` e `tool_runs` nunca são apagados. Sem teste contra PostgreSQL real.

**Item 3 — título automático:** após a primeira resposta persistida da conversa, o provider já configurado recebe uma chamada curta (máximo 48 tokens) sem ferramentas. Atualização condicionada à ausência de resposta anterior; exceção, HTTP de erro ou título vazio preserva o título inicial. Validado com provider dublado.

**Item 4 — preferências gerais:** nova tabela por principal autenticado com instruções de até 3000 caracteres e estilo `concise|balanced|detailed`; rotas GET/PUT não aceitam escolher outro owner. Preferências entram no prompt antes da guidance de segurança. Migração `017-user-preferences` aplicada e registrada no PostgreSQL de teste (validação de 2026-11-19); nenhuma chamada de serviço externo.

**Item 5 — escalonamento humano:** concluído na tarefa 80. A aprovação cria pedido persistente com motivo protegido; o administrador sempre atende e pode liberar atendentes por pessoa. Fila interna notifica atendentes, permite assumir uma única vez com atualização condicional e resolver pelo responsável ou admin, notificando quem pediu. API protegida, tela Atendimento com contagem e ações, auditoria e testes unitários. Sem envio externo. PostgreSQL real pendente por ausência de `TEST_DATABASE_URL` neste ambiente.

**Item 6 — disponibilidade do modelo:** providers oficiais OpenAI e Anthropic consultam `/models/{id}` antes do POST de chat e devolvem erro claro em modelo ausente, chave recusada ou checagem inconclusiva. Endpoints OpenAI-compatible/customizados e Gemini não usam essa verificação, pois não compartilham contrato garantido. Testes usam `fetch` dublado; nenhuma API real foi chamada.

**Item 7 — Anthropic:** adapter implementa Messages API, tradução de system/messages/tool_use/tool_result e converte SSE de texto/argumentos de ferramenta ao formato consumido pelo chat. Chave somente via `ANTHROPIC_API_KEY`; sem novo pacote. Testes de tradução e disponibilidade usam respostas dubladas. O caminho de imagem remota não foi validado contra serviço real.

**Validação final dos itens 1–7 (2026-11-19):** Jest completo (`cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand`) → exit 0, 34 suítes e 157 testes. Typecheck (`... exec tsc --noEmit`) → exit 0. `git diff --check` → exit 0. Também rodados focados: rotinas 13 testes; retenção+rotinas 16; título+chat 11; preferências+chat+rotinas+retenção 28; aprovação de atendimento+registro 7; providers Anthropic+OpenAI 11, todos exit 0. Sem instalação ou chamadas a serviços externos; manifests e lockfile sem alteração.

## Validação PostgreSQL e notificações internas (2026-11-19, base 186ec44)

**Tarefa 1 — validação real:** adicionados testes de integração com `TEST_DATABASE_URL` para retenção de auditoria, título automático e preferências por principal. A retenção remove eventos antigos em lotes, mantém eventos ligados a aprovação pendente, não remove aprovações nem `tool_runs`, e não roda sem `AUDIT_RETENTION_DAYS`. O teste de título confirma persistência com provedor dublado e preservação do título anterior quando o provedor falha. O teste de preferências confirma leitura/gravação isolada e que uma pessoa não altera a preferência de outra. O padrão é o de `routines.pg.spec.ts`, com UUIDs/nome únicos e limpeza das próprias linhas.

**Tarefa 2 — notificações internas:** migration `019-notifications` cria tabela e índice de não lidas. `NotificationsService` persiste eventos `approval.pending`, `routine.failed` e `tool_limit.reached`, lista por owner autenticado e permite marcar como lida apenas pelo próprio owner. Os produtores são approval/tool loop e rotinas; falha ao persistir notificação não interrompe a operação original. Falhas de rotina são notificadas ao dono da rotina (`routines.owner`, migration `020-routine-owner`). Rotinas criadas antes da migration ficam com `sistema`. Validado contra PostgreSQL de teste. Não há entrega externa.

**Validação observada:** PostgreSQL descartável na porta 55432, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres`; Jest focado `routines.pg.spec.ts audit-retention.pg.spec.ts conversation-title.pg.spec.ts user-preferences.pg.spec.ts notifications.pg.spec.ts` → exit 0, 5 suítes e 7 testes. Jest completo sem `TEST_DATABASE_URL` → exit 0, 34 suítes passaram, 5 ignoradas; 157 testes passaram, 7 ignorados (os testes `.pg.spec.ts` são condicionais à variável). `tsc --noEmit` → exit 0. Typecheck incluiu as alterações. Nenhum bug de persistência foi revelado. Não foram chamadas APIs de provedor nem serviços externos. A migration `020-routine-owner` e o commit `4bd593b` já adicionaram ownership às rotinas; notificações de falha podem ser atribuídas a esse owner, e rotinas antigas ainda usam `sistema`.

## Andamento da atualização automática do desktop (2026-11-19)

Adicionado o plugin oficial Tauri updater (`tauri-plugin-updater` Rust e `@tauri-apps/plugin-updater` JavaScript, ambos `2.14.1`, publicados em 2026-10-28, licença `MIT OR Apache-2.0`). A aba Atualizações consulta automaticamente ao ser aberta, mostra versão instalada/atualização disponível, permite consultar de novo e iniciar a instalação assinada. O bundle MSI/NSIS gera artefatos do updater em build. A chave privada foi criada fora do repositório em `%LOCALAPPDATA%\GrupoJadson\updater\signing.key`; somente a chave pública está no `tauri.conf.json`. O endpoint padrão é `https://updates.example.invalid/{{target}}/{{arch}}/{{current_version}}`, endereço de exemplo reservado, sem serviço hospedado. Pendente: configurar endpoint HTTPS real e publicar manifestos/artefatos assinados. Nenhum endpoint externo foi chamado.

**Validação deste item:** `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` → exit 0 (toolchain MinGW portátil). Em `apps/desktop`, `pnpm exec tsc --noEmit` → exit 0 e `pnpm exec vitest run src/lib/updates.test.ts` → exit 0, 1 arquivo e 4 testes. No backend, `pnpm exec tsc --noEmit` → exit 0 e `pnpm exec jest --runInBand` → exit 0, 34 suítes passaram, 5 ignoradas; 157 testes passaram, 9 ignorados (os testes PostgreSQL são condicionais). A primeira tentativa isolada do Vitest falhou com `spawn EPERM` no sandbox; a mesma execução passou com permissão para iniciar o helper esbuild. Não houve teste contra endpoint hospedado; o endpoint continua `.invalid`.

## Andamento da primeira execução guiada (2026-11-19)

A tela Welcome agora consulta o health público e mostra o estado do backend, PostgreSQL, pgvector e Redis. Quando falta PostgreSQL, permite salvar a URL do banco e um token de sistema aleatório de 256 bits em `%LOCALAPPDATA%\GrupoJadson\setup.json`; o backend carrega esses valores na inicialização. No modo de desenvolvimento, o Vite lê o token salvo para autenticar as chamadas locais; no app empacotado, o frontend o obtém por comando Tauri. A fila em memória não exige Redis; selecioná-lo explicitamente continua exigindo uma conexão. A configuração fica no perfil local do Windows, com as permissões herdadas dessa pasta; não há criptografia própria do arquivo.

**Pendente:** o Tauri não instala nem inicia PostgreSQL ou o backend. A tela orienta iniciar o banco (`docker compose up -d postgres`, quando Docker Compose estiver disponível), iniciar/reiniciar o backend (`pnpm dev:backend`) e então verificar novamente. A instalação do banco, o gerenciamento automático do serviço e a configuração de provedores de IA continuam fora deste item.

**Validação observada:** backend focado `jest --runInBand src/modules/bootstrap/desktop-setup.spec.ts src/modules/queue/queue.service.spec.ts` → exit 0, 2 suítes e 7 testes; o Jest completo → exit 0, 36 suítes passaram, 5 ignoradas; 164 testes passaram, 9 ignorados. Backend `tsc --noEmit` → exit 0. Desktop `tsc --noEmit` → exit 0; Vitest completo → exit 0, 5 arquivos e 21 testes. O `cargo check` não foi validado nesta rodada: exit 1 porque o Cargo local está em modo offline e o índice/cache não contém `tauri-plugin-opener`, dependência já declarada antes desta tarefa; nenhum pacote foi baixado. `cargo fmt --check` também não rodou, pois `rustfmt` não está instalado. Nenhum serviço externo foi chamado.

## Andamento do ditado por voz (2026-11-19)

Plano aplicado após leitura do código existente e de `OpenBot/shared/on-device-speech.ts`, `shared/dictation.ts` e dos controles de ditado do composer: manter a Web Speech API no campo atual, exigir `processLocally`, consultar disponibilidade do pt-BR e preparar o pacote local apenas após clique. A primeira ação prepara/desmascara o idioma; a pessoa inicia a gravação com um segundo clique. Não há fallback para reconhecimento remoto, envio de áudio ao backend ou transcrição em serviço externo. Quando a API, o modo local, o idioma ou o microfone falham, o composer mostra um erro acessível.

**Validação observada:** em `apps/desktop`, `pnpm exec tsc --noEmit` → exit 0; `pnpm exec vitest run` → exit 0, 6 arquivos e 25 testes. A suíte verifica ausência da API, exigência de processamento local, disponibilidade/instalação do pacote e mensagens de erro. Backend `tsc --noEmit` → exit 0; Jest completo → exit 0, 36 suítes passaram, 5 ignoradas; 164 testes passaram, 9 ignorados. `git diff --check` → exit 0. A captura de microfone não foi exercitada em um WebView/dispositivo real; nenhum serviço de fala ou provedor foi chamado.

## Compartilhamento de bots (item 9 das 10 próximas)

**Etapa 1 — migration e serviço de permissões:** modelo aprovado em `docs/PROPOSTA_COMPARTILHAMENTO_BOTS.md`. A migration `021-bot-sharing` mantém bots existentes sob `owner_id='sistema'` e cria times, membership e concessões diretas/por time. `AgentPermissionsService` calcula acesso a cada verificação, dá precedência a `editor`, remove imediatamente acesso revogado ou de usuário inativo, limita administração de times a admins globais e permite ao dono conceder/revogar compartilhamento. Bots do sistema seguem visíveis/úteis, com gestão administrativa.

**Validação observada da etapa 1:** `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres`, Jest completo → exit 0, 43 suítes e 178 testes; typecheck `tsc --noEmit` → exit 0. Testes PostgreSQL verificaram concessão direta, papel mais alto entre concessões, revogação de membro, rejeição de operador na administração de times e pessoa inativa. API e interface ainda pendentes.

**Etapa 2 — API:** `GET /agents` lista apenas bots acessíveis e oculta instruções/política de ferramenta para papel `user`; criação define `owner_id` pelo principal autenticado; edição/exclusão verificam papel; rotas de compartilhamento exigem dono. `/teams` permite listar nomes e admins globais gerenciam times/memberships. O chat valida acesso para o bot selecionado e para cada agente roteado por grupo. Conversas e memórias seguem no escopo atual e não são compartilhadas.

**Validação observada da etapa 2:** com PostgreSQL descartável e `TEST_DATABASE_URL`, Jest completo → exit 0, 44 suítes e 183 testes; testes PG de permissões/API → exit 0, 4 testes; `tsc --noEmit` → exit 0. Cobertos no PG: acesso direto/time, precedência de editor, revogação, inatividade e filtro/ocultação de campos na listagem da API. Falta implementar e validar a interface.

**Isolamento do histórico:** a inspeção da API revelou que conversas ainda eram globais. A migration `022-conversation-owner` atribui o histórico anterior ao principal `sistema`; criação, listagem, título, mensagens e exclusão agora verificam `owner_id`. Isso mantém conversas privadas e impede que um bot compartilhado compartilhe histórico.

**Validação do isolamento:** PostgreSQL descartável com `TEST_DATABASE_URL`; Jest completo → exit 0, 45 suítes e 185 testes; typecheck `tsc --noEmit` → exit 0. Testes de integração confirmam que um segundo principal não lista, acrescenta mensagem, altera título nem remove a conversa alheia; o dono continua acessando e o histórico legado permanece em `sistema`.

**Etapa 3 — interface:** a galeria esconde ações de edição de usuários simples; o perfil distingue edição de editor e compartilhamento de dono. Donos concedem/revogam acesso a pessoas e times como `user` (conversar) ou `editor` (conversar e editar). Configurações de acesso permitem a admins globais criar/excluir times e adicionar/remover membros. A lista de agentes do servidor prevalece sobre cópias locais, para não ressuscitar bots revogados ou inacessíveis. Nenhuma conversa ou memória é exibida no painel de compartilhamento.

**Validação observada da interface e rodada completa:** desktop `tsc --noEmit` → exit 0; Vitest → exit 0, 7 arquivos e 27 testes. Backend `tsc --noEmit` → exit 0; Jest com `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres` → exit 0, 45 suítes e 185 testes (inclui testes PostgreSQL reais das permissões/API e isolamento do histórico). A UI não foi exercitada em um WebView com diferentes contas reais.
