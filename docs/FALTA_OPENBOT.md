# O que falta migrar do OpenBot

Data: 2026-11-12. Auditoria somente de leitura: nada foi implementado. Referência: `OpenBot/` (fora do Git, licença MIT, CopilotKit), conforme `docs/PLANO_MIGRACAO_REFERENCIAS.md`.

## Método e limites

- **OpenBot:** caminhos conferidos no disco. Os caminhos são relativos a `OpenBot/`.
- **Nosso lado:** conferido por leitura de código (`apps/backend/src`, `apps/desktop/src`) e busca por palavras-chave. Não rodei o app nem testei o comportamento de cada item.
- **Status:**
  - **Feito:** existe no código e cobre o caso básico.
  - **Parcial:** existe só em parte; a lacuna está descrita na coluna.
  - **Falta:** não encontrado no código.
- **Esforço:** P (até 2 dias), M (1 a 2 semanas), G (mais de 2 semanas ou depende de infraestrutura). Estimativa grosseira, sem medição.
- **Prioridade:** Alta, Média ou Baixa. Leva em conta valor para o usuário, risco de segurança e custo. Como o usuário não tem verba, só entram na lista de 10 os itens que podem ser feitos sem serviço pago.

## Tabela

### Bots e agentes

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Bots com perfil durável (criar, editar, ligar/desligar) | `server/src/agents/profile-store.ts`, `profile-types.ts`; `docs/coworkers.md` | Feito (básico): `backend/src/modules/agents` | — | — |
| Grupos com vários bots numa conversa | `server/src/channels/group.ts`; `app/src/routes/_authed/_app/group/$channelId.tsx` | Parcial: `agents/groups.service.ts`, `chat/group-routing.ts`; sem canais por pessoa | M | Média |
| Handoff e subagentes entre bots | `server/src/agents/handoff*.ts`, `subagent.ts` | Parcial: `handoffs.service` (limite de 3 por conversa, auditado) | M | Baixa |
| Escalonamento para pessoa | `server/src/agents/escalation.ts` | Falta | P | Baixa |
| Trazer agente próprio (AG-UI ou endpoint) | `server/src/agents/endpoint.ts`, `registry.ts`, `managed-endpoint.ts` | Falta: só há provedores de modelo | M | Baixa |
| Compartilhar bot com pessoas e times | `server/src/team-bots/`, `server/src/people/`; `app/.../bots.$agentId.sharing.tsx` | Falta | M | Média |
| Alcance do bot (onde a pessoa pode falar com ele) | `app/src/routes/_authed/_app/reachability.tsx`, `bots.$agentId.reach.tsx` | Falta | G | Baixa |

### Conversa e interface

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Respostas em streaming | `server/src/channels/socket.ts`, `events.ts` | Feito: `chat/chat.controller.ts` (SSE) | — | — |
| Título de conversa gerado automaticamente | `server/src/channels/titler.ts` | Parcial: título vem da criação (`conversations.service.ts`); sem gerador | P | Baixa |
| Prévia de conversa sem markdown | `server/src/channels/summary.ts` | Feito: `desktop/src/lib/preview.ts` | — | — |
| Anexos de imagem | `server/src/channels/attachments.ts`, `shared/attachment-mime.ts` | Feito: `chat/image-attachments.ts` | — | — |
| Anexos de documentos (DOCX, XLSX) | `shared/attachments.ts`, `server/src/channels/attachment-parts.ts` | Parcial: só PDF (`documents`, `pdf-parse`) | M | Média |
| Respostas com componentes ricos (gráficos, cartões) | `server/src/components/`; `app/.../settings/components-gallery` | Falta | G | Baixa |
| Imagens geradas por ferramentas | `server/src/tool-images.ts` | Falta | P | Baixa |
| Ditado por voz (entrada) | `server/src/dictation/`, `shared/dictation.ts`, `shared/on-device-speech.ts` | Falta | M | Média |
| Leitura da resposta em voz alta | `server/src/voice/`, `shared/voice-session.ts` | Parcial: `speechSynthesis` em `desktop/src/App.tsx` | P | Baixa |
| Tour inicial e dicas | `app/src/routes/_authed/_app/start.$startId.tsx`; `shared/starter-tour.ts` | Falta | P | Baixa |

### Ferramentas e segurança

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Registro de ferramentas com nível de risco | `server/src/plugins/tools.ts`, `shared/tool-name.ts` | Feito: `tools/tools.registry.ts` (`read` e `sensitive`) | — | — |
| Busca de ferramentas quando há muitas | `shared/tool-search.ts`, `server/src/agents/tool-search.ts` | Falta (pouco útil com poucas ferramentas) | P | Baixa |
| Limite de ferramentas por turno | `server/src/agents/tool-limit.ts`, `shared/model-tool-limit.ts` | Parcial: política em `tools/agent-policy.service.ts`, sem limite por turno confirmado | P | Alta |
| Aprovação humana antes de ação sensível | `server/src/approvals/`; `docs/approvals.md` | Feito para as ações atuais: `audit/approvals.service.ts`, aba Atividades | — | — |
| Trilha de auditoria | `server/src/audit.ts` | Feito: `audit/audit.service.ts` | — | — |
| Retenção e limpeza da auditoria | `server/src/audit-retention.ts` | Falta | P | Baixa |
| Tratamento de conteúdo não confiável (contra injeção de instruções) | `server/src/untrusted-content.ts`, `shared/user-content.ts`, `shared/user-content-hardening.test.ts` | Falta | M | Alta |
| Mascaramento de segredos em saídas e logs | `agent-computer/src/secret-masking.ts`; mascaramento no gravador | Parcial: `integrations/secret-box.ts` cifra credenciais; mascaramento de saída não encontrado | P | Média |
| Assinar requisições de navegação (web-bot-auth) | `server/src/web-bot-auth.ts`, `agent-computer/src/web-bot-auth.ts` | Falta | M | Baixa |

### Computador e navegador do bot

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Navegador próprio do bot em contêiner, com tela ao vivo | `agent-computer/src/browser-host.ts`, `screencast.ts`, `live-page.ts`; `supervisor/` | Falta | G | Baixa |
| Assumir o navegador para entrar numa conta e devolver ao bot | `agent-computer/src/sign-in.ts`, `viewer.ts`, `control.ts` | Falta | G | Baixa |
| Pasta de trabalho do bot | `agent-computer/src/workspace.ts`, `workspaces.ts` | Parcial: ferramentas `computador.*` sobre a pasta `workspace` | P | — |
| Gravar uma demonstração no navegador | `extension/`; `agent-computer/src/recorder.ts`; `server/src/recorder/` | Falta | G | Baixa |
| Extensão do navegador | `extension/` | Falta | G | Baixa |

### Plugins e integrações

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Servidores MCP | `server/src/plugins/mcp.ts`; `plugin-store/servers.ts` | Parcial: `mcp/mcp.service.ts`, só o servidor de arquivos (stdio) | M | Média |
| Catálogo de conectores (Composio, Arcade) | `server/src/plugins/composio.ts`, `arcade.ts`, `catalogue.ts`, `broker.ts`; `docs/plugins/composio.md` | Falta | G | Baixa |
| Google Agenda e Drive | `server/src/plugins/google-drive-rest.ts`; `docs/plugins/google-drive.md` | Parcial: `google/` (Drive só lê; criar evento pede aprovação) | P | Média |
| Notion | `docs/plugins/notion.md` | Parcial: `tools/notion.ts` (buscar e criar página) | P | Baixa |
| Compartilhar conexões entre pessoas | `server/src/plugins/shared-accounts.ts`, `shared-use.ts` | Falta | M | Baixa |
| Cofre de credenciais | `server/src/credentials.ts`; `app/.../settings/passwords.tsx` | Parcial: aba Cofre e `integrations/` | P | Baixa |

### Rotinas e proatividade

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Rotinas agendadas | `server/src/routines/schedule.ts`, `runner.ts`, `sweep.ts`; `docs/routines.md` | Parcial: `routines/routines.service.ts` usa `setInterval`, não um agendador de verdade | M | Alta |
| Responsabilidades contínuas (o bot cuida de algo recorrente) | `server/src/responsibilities/` | Falta | G | Média |
| Check-ins proativos | `server/src/proactive/`; `mobile/src/check-ins.tsx` | Falta | G | Baixa |
| Notificações | `mobile/src/notifications.ts`; `server/src/delivery/` | Falta | M | Baixa |
| Tarefas e fila de trabalho | `server/src/tasks/`, `server/src/work/` | Falta (a palavra "tarefa" no desktop é só o lançador de texto) | M | Baixa |
| Aplicativo móvel | `mobile/` | Falta | G | Baixa |

### Memória, preferências e aprendizado

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Memória por pessoa (lembrar, listar, apagar) | `server/src/memory/` (`store`, `ingestion`, `tools`) | Parcial: `memory/memory.service.ts`; opt-out não confirmado | P | Média |
| Preferências e instruções do usuário | `server/src/user-preferences.ts`, `user-instructions.ts` | Falta | P | Média |
| Habilidades reutilizáveis (skills) | `server/src/plugins/route-groups/skills.ts`; `app/.../skills` | Falta | M | Média |
| Aprendizado automático compartilhado (Learning) | `server/src/learning/`; `docs/automatic-learning.md` | Falta (depende do serviço Intelligence; plano gratuito a verificar) | G | Baixa |

### Pesquisa na web

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Busca na web | `shared/research.ts`; `docs/web-research.md` | Parcial: `tools/web-search.ts` (Wikipédia sem chave; Tavily com chave) | P | Média |
| Leitura do conteúdo de uma página | `shared/research.ts` | Falta | M | Alta |

### Modelos e custos

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Provedores de modelo | `shared/model-providers.json`; `server/src/model-catalogue.ts` | Parcial: OpenAI, Gemini, Ollama e endpoint compatível (`providers/`); sem catálogo | — | — |
| Anthropic | `shared/model-providers.json`; `server/src/model-catalogue.ts` | Falta | P | Média |
| Checagem de disponibilidade e rejeição de modelo | `server/src/model-availability-check.ts`, `model-rejection.ts` | Falta | P | Baixa |
| Medição de uso e custo | `server/src/model-billing.ts` | Parcial: `chat/usage.service.ts`, aba Uso; granularidade por conversa não confirmada | P | — |
| Entrar com Google ou xAI no app (OAuth do provedor) | `server/src/provider-oauth.ts`; `desktop/PROVIDER_OAUTH.md` | Falta | G | Baixa |

### Pessoas, acesso e administração

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Entrada por provedor de identidade (OIDC) | `server/src/identity/`; `app/.../admin/identity-providers.tsx` | Parcial: `auth/oidc.service.ts`; sem tela de administração | P | — |
| Papéis e usuários | `server/src/people/`, `server/src/passwords/` | Parcial: papéis admin, operador e leitor (`auth/users.service.ts`) | — | — |
| Modo pessoal, sem login | `server/src/edition.ts`; `docs/personal-edition.md` | Falta (o app exige login) | M | Média |
| Painel administrativo | `app/src/routes/_authed/admin/*` | Parcial: abas de Configurações (geral, computador, permissões, cofre, uso, atualizações) | — | — |

### Aplicativo desktop e instalação

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Atualização automática do app | `desktop/src/UpdateOffer.tsx`, `ShellUpdates.tsx`; `docs/desktop-updates.md` | Falta: a aba Atualizações só mostra a versão | M | Alta |
| Primeira execução guiada | `desktop/src/Welcome.tsx`, `SetupProgress.tsx`, `StartFresh.tsx`; `server/src/setup/`; `app/.../onboarding.tsx` | Falta | M | Alta |
| Telemetria transparente | `desktop/src/telemetry.ts`, `desktop/TELEMETRY.md`; `server/src/telemetry/` | Falta | M | Baixa |
| Assinatura de código do Windows | `docs/windows-signing.md` (usa Azure Key Vault, que é pago) | Falta. Não há alternativa gratuita verificada | G | Média |
| Verificação de requisitos do Windows | `desktop/src/WindowsBlocker.tsx` | Falta | P | Baixa |
| Tela de status e encerramento | `desktop/src/StatusWindow.tsx`, `ShuttingDown.tsx` | Parcial: estado do PostgreSQL na barra lateral | P | Baixa |

## Resumo da tabela

- **Feito:** 7 itens. Bots com perfil, streaming, prévia de conversa, anexos de imagem, registro de ferramentas, aprovações e auditoria.
- **Parcial:** 21 itens.
- **Falta:** 36 itens. Os de maior peso são o computador do bot em contêiner, o catálogo de conectores e o Learning.
- Total: 64 linhas. A contagem foi feita pela própria tabela.

## As 10 próximas a implementar

Ordem de prioridade. Todos podem ser feitos sem serviço pago.

1. **Tratamento de conteúdo não confiável (contra injeção de instruções).** Os agentes já leem arquivos, Drive e Notion. Um documento com instruções escondidas pode induzir uma ação. As aprovações reduzem o dano, mas não o eliminam. Deve vir antes de ampliar a leitura de páginas e ferramentas. Referência: `server/src/untrusted-content.ts`. Esforço M.
2. **Atualização automática do app.** A aba Atualizações é só um texto com a versão. Cada correção exige reinstalar o `.exe` à mão, o que pesa para uma versão que já sai para outras pessoas testarem. Referência: `docs/desktop-updates.md`, `desktop/src/UpdateOffer.tsx`. Esforço M. Usa o plugin oficial do Tauri; a chave de assinatura é gerada localmente.
3. **Primeira execução guiada.** O usuário final não deve precisar configurar banco, Redis e variáveis de ambiente à mão. Referência: `desktop/src/Welcome.tsx`, `server/src/setup/`. Esforço M.
4. **Rotinas com agendamento real.** Hoje há um `setInterval`. Um agendador de verdade permite horários fixos e continuidade depois de reiniciar. Referência: `server/src/routines/schedule.ts`, `sweep.ts`. Esforço M.
5. **Leitura do conteúdo de uma página.** Sem isso o agente só vê trechos de busca. Pode usar `fetch` e extração de texto, sem chave paga. Referência: `shared/research.ts`. Esforço M.
6. **Limite de ferramentas por turno.** Evita laços caros e respostas sem fim, o que importa com verba zero. Referência: `server/src/agents/tool-limit.ts`. Esforço P.
7. **Mascaramento de segredos em saídas e logs.** Evita que uma chave apareça na conversa ou no log. Custo baixo, ganho de segurança alto. Referência: `agent-computer/src/secret-masking.ts`. Esforço P.
8. **Preferências do usuário e memória com opt-out.** Dá controle sobre o que é lembrado, e cada pessoa decide. Referência: `server/src/user-preferences.ts`, `memory/`. Esforço P a M.
9. **Compartilhar bot com pessoas e times.** É o que transforma o app de uso individual em uso de equipe. Referência: `server/src/team-bots/`, `server/src/people/`. Esforço M.
10. **Ditado por voz (entrada).** Ajuda quem digita pouco e amplia o acesso. Pode usar a fala do próprio sistema, sem custo. Referência: `server/src/dictation/`, `shared/on-device-speech.ts`. Esforço M.

**Por que essa ordem:** os quatro primeiros cobrem segurança, manutenção e primeira experiência, que são os riscos mais altos para um app já distribuído. Os itens 5 a 8 aumentam o que o bot consegue fazer com pouco custo. Os itens 9 e 10 ampliam o uso.

**Fora da lista de 10, de propósito:** computador do bot em contêiner (G, exige Docker e manutenção de contêineres), catálogo de conectores Composio e Arcade (serviços de terceiros, com planos pagos a verificar), Learning (depende do serviço Intelligence, com plano gratuito a verificar e licença própria), aplicativo móvel (G) e responsabilidades contínuas (G, depende de rotinas e check-ins).

## Licenças e cuidados

- O OpenBot é MIT, copyright CopilotKit (2026). Qualquer trecho copiado deve manter o aviso em `THIRD_PARTY_NOTICES.md`, que já traz a seção do OpenBot com a cópia integral da licença.
- **Não copiar** `shared/marks/` (logos de fornecedores), nem `.env`, chaves ou `.env.openbot-installation-id`.
- **Padrão, não cópia:** para a maioria dos itens recomenda-se reimplementar a ideia com o nosso stack (NestJS, Tauri, React 18). Se algum trecho for copiado, registrar em `THIRD_PARTY_NOTICES.md` antes do commit.
- Dependências novas: verificar a licença antes de adicionar (regra do plano de migração).
