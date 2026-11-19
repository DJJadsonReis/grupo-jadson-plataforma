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
| Mascaramento de segredos em saídas e logs | `agent-computer/src/secret-masking.ts`; mascaramento no gravador | Parcial: mascarador próprio em `apps/backend/src/common/secret-masking.ts`, aplicado às saídas, erros e logs cobertos; formatos proprietários ainda dependem de lista conhecida | P | Média |
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
| Rotinas agendadas | `server/src/routines/schedule.ts`, `runner.ts`, `sweep.ts`; `docs/routines.md` | Parcial: `next_run_at` persistido no PostgreSQL e varredura no boot; ainda usa polling e não tem claim distribuído | M | Alta |
| Responsabilidades contínuas (o bot cuida de algo recorrente) | `server/src/responsibilities/` | Falta | G | Média |
| Check-ins proativos | `server/src/proactive/`; `mobile/src/check-ins.tsx` | Falta | G | Baixa |
| Notificações | `mobile/src/notifications.ts`; `server/src/delivery/` | Falta | M | Baixa |
| Tarefas e fila de trabalho | `server/src/tasks/`, `server/src/work/` | Falta (a palavra "tarefa" no desktop é só o lançador de texto) | M | Baixa |
| Aplicativo móvel | `mobile/` | Falta | G | Baixa |

### Memória, preferências e aprendizado

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Memória por pessoa (lembrar, listar, apagar) | `server/src/memory/` (`store`, `ingestion`, `tools`) | Parcial: `memory/memory.service.ts`, escopo autenticado e opt-out respeitado; preferências simples em tabela | P | Média |
| Preferências e instruções do usuário | `server/src/user-preferences.ts`, `user-instructions.ts` | Parcial: opt-out individual da memória; instruções/preferências gerais ainda faltam | P | Média |
| Habilidades reutilizáveis (skills) | `server/src/plugins/route-groups/skills.ts`; `app/.../skills` | Falta | M | Média |
| Aprendizado automático compartilhado (Learning) | `server/src/learning/`; `docs/automatic-learning.md` | Falta (depende do serviço Intelligence; plano gratuito a verificar) | G | Baixa |

### Pesquisa na web

| Funcionalidade | Onde está no OpenBot | Status no nosso | Esforço | Prioridade |
|---|---|---|---|---|
| Busca na web | `shared/research.ts`; `docs/web-research.md` | Parcial: `tools/web-search.ts` (Wikipédia sem chave; Tavily com chave) | P | Média |
| Leitura do conteúdo de uma página | `shared/research.ts` | Parcial: ferramenta `pagina.ler`, texto envelopado e limites/bloqueios; conexão fixa o IP validado (pinnedFetch, sem nova resolução DNS; anti DNS rebinding) | M | Alta |

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

**Andamento do item 1 (2026-11-19):** envelope `untrusted_data` em `apps/backend/src/modules/tools/untrusted-content.ts`, aplicado a todo resultado de ferramenta que não seja local (`tools.service.ts`, `safeRun`). Ainda falta: o loop de ferramentas que devolve esses resultados ao modelo (hoje não existe) e o uso de `UNTRUSTED_GUIDANCE` no prompt. Testes escritos (`untrusted-content.spec.ts`), mas não executados: `apps/backend` não tem jest instalado nem o TypeScript está disponível em `node_modules`.

**Atualização (2026-11-19):** `tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --version` retornou `9.15.0`; o Node do PATH retornou `v24.14.0`, e a toolchain local exigida (Node 22 em `tools/node/node.exe`) não está presente. `pnpm install --offline` abriu o prompt de remoção e reinstalação dos diretórios `node_modules`; a operação não foi confirmada, portanto a instalação não ocorreu. `pnpm-lock.yaml` permaneceu sem alteração. Em tentativa anterior, `npx jest --runInBand src/modules/tools` falhou porque `apps/backend/node_modules/jest/bin/jest.js` não existe; `node_modules/.bin/tsc --noEmit` falhou porque `apps/backend/node_modules/typescript/bin/tsc` não existe. Nenhum teste ou typecheck passou. É necessário decidir se autoriza prosseguir com a reinstalação que remove os `node_modules` atuais.

**Prompt contra conteúdo não confiável:** `chat.controller.ts` inclui `UNTRUSTED_GUIDANCE` como mensagem de sistema. A ordem intencionada é instruções persistidas do agente primeiro e orientação de segurança em seguida; mensagens de sistema enviadas pelo cliente são descartadas. Essa alteração ainda não foi validada por teste/typecheck.

**Loop de ferramentas:** leitura de `chat.controller.ts`, `provider.types.ts`, `providers.service.ts`, `openai.provider.ts` e `tools.registry.ts` confirmou que o chat faz apenas uma chamada simples `providers.stream`; `CompletionInput` não declara ferramentas e o stream não trata `tool_calls`. Portanto, nenhum resultado de ferramenta retorna ao modelo hoje. A tarefa de fechar o loop foi interrompida conforme instrução, sem inventar protocolo/loop; testes do caminho novo não foram adicionados porque o caminho não existe.

**Por que essa ordem:** os quatro primeiros cobrem segurança, manutenção e primeira experiência, que são os riscos mais altos para um app já distribuído. Os itens 5 a 8 aumentam o que o bot consegue fazer com pouco custo. Os itens 9 e 10 ampliam o uso.

**Fora da lista de 10, de propósito:** computador do bot em contêiner (G, exige Docker e manutenção de contêineres), catálogo de conectores Composio e Arcade (serviços de terceiros, com planos pagos a verificar), Learning (depende do serviço Intelligence, com plano gratuito a verificar e licença própria), aplicativo móvel (G) e responsabilidades contínuas (G, depende de rotinas e check-ins).

**Andamento do item 7 (2026-11-19):** implementado mascarador próprio em `apps/backend/src/common/secret-masking.ts`, com marcador `[REDACTED]` e mínimo de 8 caracteres para valores conhecidos/padrões. Lê sem escrita e mantém em memória somente durante a sanitização valores de `tavily`, `notion` e `modelo_chave` das integrações, além de variáveis de ambiente com nomes de chave/token/segredo/senha/URLs de conexão. Aplicado a valores e erros de ferramentas antes de persistir/devolver, ao texto final do modelo antes de enviar/persistir, aos erros enviados de volta ao modelo e aos logs que interpolam erros em chat, rotinas, banco, Redis, MCP e OIDC. Falhas de conexão do provider retornam mensagem genérica. A entrada escrita pelo usuário não é alterada.

**Validação do item 7 (2026-11-19):** `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand` → exit 0, 28 suítes e 119 testes passando. `cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec tsc --noEmit` → exit 0. Os testes focados passaram antes: 4 suítes, 20 testes. Padrões cobertos incluem `sk-`, Tavily (`tvly-`), Notion (`secret_`, `ntn_`), Bearer, JWT, Google API key, GitHub/Slack token, credenciais em URL e parâmetros comuns de token/chave. Formatos proprietários sem valor conhecido não são reconhecidos; tokens codificados/transformados e valores conhecidos menores que 8 caracteres ficam fora do mascaramento deliberadamente. Nenhum teste usou credencial externa real.

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

**Item 5 — escalonamento humano:** ferramenta sensível `atendimento.humano` gera aprovação; só a execução aprovada grava `human_support.requested` internamente. Não há envio externo. Validado com dublês de aprovação, banco e auditoria.

**Item 6 — disponibilidade do modelo:** providers oficiais OpenAI e Anthropic consultam `/models/{id}` antes do POST de chat e devolvem erro claro em modelo ausente, chave recusada ou checagem inconclusiva. Endpoints OpenAI-compatible/customizados e Gemini não usam essa verificação, pois não compartilham contrato garantido. Testes usam `fetch` dublado; nenhuma API real foi chamada.

**Item 7 — Anthropic:** adapter implementa Messages API, tradução de system/messages/tool_use/tool_result e converte SSE de texto/argumentos de ferramenta ao formato consumido pelo chat. Chave somente via `ANTHROPIC_API_KEY`; sem novo pacote. Testes de tradução e disponibilidade usam respostas dubladas. O caminho de imagem remota não foi validado contra serviço real.

**Validação final dos itens 1–7 (2026-11-19):** Jest completo (`cd apps/backend && node ../../tools/pnpm/node_modules/pnpm/bin/pnpm.cjs exec jest --runInBand`) → exit 0, 34 suítes e 157 testes. Typecheck (`... exec tsc --noEmit`) → exit 0. `git diff --check` → exit 0. Também rodados focados: rotinas 13 testes; retenção+rotinas 16; título+chat 11; preferências+chat+rotinas+retenção 28; aprovação de atendimento+registro 7; providers Anthropic+OpenAI 11, todos exit 0. Sem instalação ou chamadas a serviços externos; manifests e lockfile sem alteração.

## Validação PostgreSQL e notificações internas (2026-11-19, base 186ec44)

**Tarefa 1 — validação real:** adicionados testes de integração com `TEST_DATABASE_URL` para retenção de auditoria, título automático e preferências por principal. A retenção remove eventos antigos em lotes, mantém eventos ligados a aprovação pendente, não remove aprovações nem `tool_runs`, e não roda sem `AUDIT_RETENTION_DAYS`. O teste de título confirma persistência com provedor dublado e preservação do título anterior quando o provedor falha. O teste de preferências confirma leitura/gravação isolada e que uma pessoa não altera a preferência de outra. O padrão é o de `routines.pg.spec.ts`, com UUIDs/nome únicos e limpeza das próprias linhas.

**Tarefa 2 — notificações internas:** migration `019-notifications` cria tabela e índice de não lidas. `NotificationsService` persiste eventos `approval.pending`, `routine.failed` e `tool_limit.reached`, lista por owner autenticado e permite marcar como lida apenas pelo próprio owner. Os produtores são approval/tool loop e rotinas; falha ao persistir notificação não interrompe a operação original. Falhas de rotina são notificadas ao dono da rotina (`routines.owner`, migration `020-routine-owner`). Rotinas criadas antes da migration ficam com `sistema`. Validado contra PostgreSQL de teste. Não há entrega externa.

**Validação observada:** PostgreSQL descartável na porta 55432, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres`; Jest focado `routines.pg.spec.ts audit-retention.pg.spec.ts conversation-title.pg.spec.ts user-preferences.pg.spec.ts notifications.pg.spec.ts` → exit 0, 5 suítes e 7 testes. Jest completo sem `TEST_DATABASE_URL` → exit 0, 34 suítes passaram, 5 ignoradas; 157 testes passaram, 7 ignorados (os testes `.pg.spec.ts` são condicionais à variável). `tsc --noEmit` → exit 0. Typecheck incluiu as alterações. Nenhum bug de persistência foi revelado. Não foram chamadas APIs de provedor nem serviços externos. Pendência: a notificação de falha de rotina não pode ser atribuída a um principal até rotinas possuírem owner.
