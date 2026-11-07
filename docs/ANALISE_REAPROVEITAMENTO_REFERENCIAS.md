# Análise de reaproveitamento do referência externa — Grupo Jadson

Data: 2026-11-07. Escopo: pasta `referência externa/` na raiz de `T:\grupo-jadson` (3.202 arquivos, versão `0.3.2` no `package.json`).

**Método e limite.** Leitura estática: manifests, README, documentação em `docs/`, licença, arquivos de configuração e busca por termos nos módulos centrais (`server/src`, `shared/`, `desktop/src`). Não instalei dependências, não executei testes nem o servidor, não li o `.env` e não copiei nenhum arquivo. Não li os 3.202 arquivos linha a linha; as conclusões abaixo se apoiam nas partes listadas. Itens marcados como **não verificado** precisam de inspeção adicional.

**Verificação do Git.** Revisado em 2026-11-07: não existe pasta `.git` em `T:\grupo-jadson` nem `git rev-parse` reconhece o diretório (`fatal: not a git repository`). O diário de acompanhamento registra um commit inicial publicado, então o repositório pode estar em outro local ou ter sido perdido. Antes de qualquer alteração, é preciso localizar ou recriar o repositório e registrar o estado inicial.

## 1. Auditoria do referência externa

### 1.1 Identificação, licença e origem
- Projeto: **referência externa**, de **referência externa** (`Copyright (c) 2026 referência externa`), licença **MIT** (`referência externa/LICENSE`). O `package.json` raiz também declara MIT.
- Descrição do próprio projeto: um espaço de trabalho auto-hospedável para "coworkers de IA", com navegador, arquivos e ferramentas concedidas, e agentes que chegam via **AG-UI**.
- Distribuição: template de código aberto, edição pessoal (desktop) e edição empresarial (Helm chart, hospedagem da referência externa).
- **Restrição importante — marcas:** `shared/marks/README.md` afirma que cada logotipo vendido é marca registrada do dono e usado apenas para identificar o produto. Os ícones de fornecedores (Google, OpenAI, etc.) não devem ser reaproveitados como identidade do Grupo Jadson, mesmo com a licença MIT do código.
- **Dependências de terceiros:** a licença MIT do código não cobre as dependências. Verificado: os `package.json` do referência externa declaram `license` apenas nos próprios workspaces (11 manifests, todos do projeto); nenhum arquivo de NOTICE ou lista de licenças de terceiros foi encontrado. O `server/package.json` usa, entre outras, `pacote-externo`, `@mastra/core`, `@composio/core`, `@arcadeai/arcadejs`, `better-auth`, `drizzle-orm`, `twilio`, `@modelcontextprotocol/sdk` e `@opentelemetry/*`. **Não verificado:** as licenças de cada uma (sem `node_modules`). Esse levantamento é obrigatório antes de qualquer reuso.
- **Componentes proprietários ou de serviço:** o código referencia **referência externa Intelligence** (`server/src/intelligence-client.ts`, `intelligence-gateway-proxy.ts`, `intelligence-entitlement-check.ts`). O uso pode depender de serviço hospedado com termos próprios. **Não verificado.**

### 1.2 Arquitetura e tecnologias
- Monorepo com **Bun 1.4.3** (`bun.lock`, `bunfig.toml`) e workspaces: `app`, `server`, `worker`, `shared`, `toolkit`, `extension`.
- Front-end `app/`: React 19 + Vite (1.001 arquivos). O `desktop/` tem o shell Tauri (198 arquivos) com `App.tsx`, `LocalIntelligence` e tela de configuração.
- Servidor `server/`: **Hono** + **Drizzle ORM** + PostgreSQL (`postgres`), com migrations SQL em `server/drizzle/` (de `0000_schema.sql` a `0004...`). Autenticação com **better-auth** (SSO, SCIM, Electron e Expo), **Mastra** e **AG-UI** para agentes.
- Agentes externos (`agent-*`): 17 pastas para frameworks diferentes (LangGraph, Mastra, CrewAI, AG2, Agno, Google ADK, Pydantic AI, Claude Agent SDK, AWS Strands, Microsoft, Langroid, LlamaIndex, Antigravity, entre outros) e um `byo-url` para agente próprio.
- Navegador: `agent-computer/` (Playwright, 141 arquivos) e `server/src/browser/` e `server/src/computer/` (sandbox, políticas de rede, snapshots, controle humano para login).
- Telemetria: `docs/TELEMETRY.md` e `server/src/telemetry/`, com OpenTelemetry e scrub de dados.
- Infraestrutura: `Dockerfile`, `docker-compose.yml` (37 KB), `charts/referencia-externa` (Helm), `docker/`, `supervisor/`, `worker/`.

### 1.3 Funcionalidades por área

**Conversação e canais.** Existem `server/src/channels/` (incluindo grupos e anexos), títulos automáticos de conversa (`channels/titler.ts`), e `shared/bot-prompt.ts`. Há `dictation/` e `voice/` (transcrição e voz).

**Memória e histórico.** `server/src/memory/` tem `store.ts` (tabela `personalMemories` e `memorySources`, com hash de conteúdo), `ingestion.ts`, `intelligence.ts` (memória mantida pelo Intelligence), `tools.ts` (ferramentas de memória para o agente) e `defaults.ts` (opt-out e bloqueio de padrões). Também há `learning/` (aprendizado automático por pessoa, com compartilhamento) e `user-preferences.ts`. **Ponto forte:** memória separada por pessoa e com opt-out. **Não verificado:** a recuperação semântica (busca vetorial) — não encontrei pgvector no schema, e a recuperação depende do Intelligence.

**Agentes e subagentes.** `server/src/agents/` tem resolução de agente, `handoff-tool.ts`, `handoff-runner.ts`, `coordination-wiring.ts`, `escalation.ts`, `tool-search.ts` e `tool-limit.ts`. Ou seja: delegação entre agentes, escalonamento e limite de chamadas de ferramenta estão implementados. `team-bots/` e `people/` tratam de equipes.

**Ferramentas e plugins.** `server/src/plugins/` com `mcp.ts` (cliente MCP), `composio-adapter.ts` e integração com Arcade. O catálogo de pesquisa web (`docs/web-research.md`) traz Parallel, Exa e Firecrawl.

**Aprovação humana.** `server/src/approvals/` (política, execução, perguntas, reinício após resposta, sweep de pessoas). `docs/approvals.md` documenta o fluxo. É o controle de ações sensíveis que o nosso roadmap ainda não tem.

**Automações.** `server/src/routines/` e `docs/routines.md`: rotinas em cron (`cron-parser`), disparadas por `scripts/fire-routines.ts`, com resultado enviado ao canal.

**Modelos e provedores.** `shared/model-providers.json` (fonte única, lida por TypeScript e Python) registra OpenAI (`gpt-5.5` como padrão), Anthropic (`claude-sonnet-5-5`) e Google (`gemini-2.5-flash`). Há `model-catalogue.ts`, `model-billing.ts`, `model-availability-check.ts`, `routing/classify.ts` e `routing/model.ts`. **Modelos locais: verificado como não implementado.** A busca em código, manifests e docs encontrou apenas comentários (`shared/model-providers.ts` linha 311 e `model-providers.test.ts` linha 101) que citam Ollama, vLLM e LM Studio como servidores compatíveis com a API OpenAI sem chave. Não há adaptador, configuração padrão nem teste para eles. O suporte seria possível pela variável `OPENAI_BASE_URL`, mas não é um recurso documentado nem testado.

**Custos.** `model-billing.ts` e `admin/proactive-metrics.ts` indicam medição, mas não li a lógica completa. **Não verificado.**

**Segurança e permissões.** `server/src/auth/` (dev-actor, email-domain, SSO com criptografia de configuração), `admin/gate.ts`, `identity/`, `request-trust.ts`, `audit.ts` e `audit-retention.ts`, `credentials.ts` com `KEY_ENCRYPTION_KEY` (chave de 32 bytes em base64), `untrusted-content.ts` (conteúdo externo tratado como não confiável), `web-bot-auth.ts`, `computer/policy*.ts` (políticas de rede e de ação no navegador) e `revoked_access`.

**Arquivos.** `shared/attachments.ts` e `channels/attachments.ts` tratam anexos. Verificado: até 8 anexos por mensagem; limite de 10,7 MB por parte (base64 de um arquivo de cerca de 8 MB); tipos conhecidos incluem imagens e `text/csv`; a entrega ao modelo é feita como partes de conteúdo (`attachment-parts.ts`). **Não há** biblioteca de leitura de PDF, DOCX, XLSX ou PPTX em nenhum `package.json`, nem extração de texto desses formatos. Ou seja, a "análise de documentos" do nosso objetivo não tem implementação de origem no referência externa. Varredura de conteúdo malicioso: não encontrada.

**Interface.** `app/` (React 19, 1.001 arquivos) e `desktop/` (Tauri). Há `components/` no servidor, `Mark.tsx`, `ExternalLink.tsx`, testes de componentes e aviso de canal. **Não verifiquei** visualmente.

**Banco.** PostgreSQL com Drizzle. Tabelas identificadas no schema: `users`, `sessions`, `verifications`, `agents`, `user_instructions`, `sso_providers`, `revoked_access`, `deployment_packages`, `action_policy`, `computer_snapshot`, `routine_sweeps`, `delivery_challenges`, `learning_settings`, `learning_person_spaces`, `sandboxed_components`, `proactive_people`, `enterprise_settings`, `components`, além das de memória.

**Testes.** Muitos arquivos de teste (`*.test.ts(x)`) e scripts (`test:ci`, `test:smoke`, `test:live-*`). **Não executados.**

## 2. Comparação com o Grupo Jadson

| Área | Grupo Jadson (estado verificado) | referência externa (estado verificado) |
|---|---|---|
| Backend | NestJS 10, Node 22, pnpm 9.15.0 | Hono + Bun, Drizzle ORM |
| Banco | PostgreSQL com `pg`, 3 migrations | PostgreSQL com Drizzle, 5+ migrations, muitas tabelas |
| Autenticação | **Não existe** | better-auth, SSO, SCIM, sessões, revogação |
| Permissões e aprovação | **Não existe** | Políticas, aprovação humana, perguntas ao usuário |
| Provedores de IA | OpenAI apenas | OpenAI, Anthropic, Google; catálogo e roteamento |
| Modelos locais | **Não existe** | **Não verificado** (só menção a APIs compatíveis) |
| Memória | **Não existe** | Memória por pessoa, opt-out, ingestão, ferramentas |
| Agentes | CRUD e grupos com menção | Handoff, escalonamento, coordenação, 17 frameworks |
| Ferramentas | **Não existe** | MCP, Composio, Arcade, plugins, busca web |
| Automações | **Não existe** | Rotinas em cron, disparo por script |
| Navegador | **Não existe** | Playwright isolado, políticas de rede, takeover |
| Arquivos | Imagens em chat | Anexos gerais, dictation, voz |
| Custos | **Não existe** | Billing de modelos e métricas (não verificado) |
| Interface | React 18 + Tauri 2, uma tela grande | React 19 + Vite, desktop Tauri, mobile e extensão |
| Testes | 8 arquivos, não executados | Muitos, com suites live e smoke (não executados) |
| CI | 5 workflows manuais | Workflows de CI, segurança (zizmor) e release |

**Já temos:** chat com streaming, histórico de conversa, CRUD de agentes, grupos com menção e health check.

**Existe só no referência externa:** autenticação, permissões, aprovações, memória, ferramentas, navegador, automações, multi-provedor, delegação entre agentes, rotinas, auditoria e telemetria.

**Pode ser adaptado:** lógica de aprovação, memória, handoff, catálogo de provedores, políticas de rede do navegador e rotinas.

**Incompatível diretamente:** o workspace Bun, Hono, React 19, Drizzle e a infraestrutura Docker/Helm (são outra stack; não devem substituir o NestJS nem o pnpm). O contrato AG-UI é um protocolo, não um pacote, e pode ser adotado sem trocar o backend.

**Dependências necessárias para adaptar:** Drizzle ORM ou um mecanismo de migrations compatível com o Postgres atual; better-auth (ou outro provedor de sessão) para autenticação; `@modelcontextprotocol/sdk` para ferramentas MCP; Playwright para navegador. Cada uma exige revisão de licença.

**Não vale a pena aproveitar agora:** os 17 adaptadores de framework externos (não temos esses agentes), Helm/Kubernetes, extensão de navegador, app mobile, Twilio e voz, e a integração com o serviço Intelligence enquanto a licença não for confirmada.

## 3. Matriz de reaproveitamento

| Funcionalidade | Grupo Jadson | referência externa | Recomendação |
|---|---|---|---|
| Chat | Streaming SSE OpenAI, histórico PostgreSQL | Canais, grupos, anexos, titulador, dictation | **Manter o nosso**; reaproveitar o titulador e o modelo de canais como referência |
| Memória | Não existe | Memória por pessoa, ingestão, opt-out, ferramentas | **Adaptar** o modelo de dados e as regras de opt-out; reescrever o armazenamento sobre o Postgres atual |
| Agentes | CRUD e grupos com menção | Handoff, escalonamento, coordenação, limite de ferramentas | **Adaptar** handoff e limite de ferramentas; manter nosso CRUD |
| Ferramentas | Não existe | MCP, plugins, busca web, catálogo | **Adaptar** o cliente MCP e o registro de ferramentas; tratar a busca web como plugin |
| Modelos locais | Não existe | Não implementado; só comentários sobre APIs compatíveis | **Desenvolver** adaptador próprio para endpoint compatível com OpenAI (Ollama, LM Studio) |
| Análise de documentos | Não existe | Anexos de imagem e CSV; sem leitura de PDF/Office | **Desenvolver** do zero (escolher biblioteca de PDF/Office com licença verificada) |
| Automações | Não existe | Rotinas em cron, disparo e entrega ao canal | **Adaptar** depois de ter autenticação; não integrar agora |
| Segurança | Não existe | Auth, SSO, aprovações, auditoria, políticas | **Adaptar** aprovações e auditoria primeiro; autenticação com provedor a definir |
| Interface | React 18 + Tauri 2 com identidade própria | React 19 + Vite, outra identidade | **Manter a nossa**; usar só o padrão de atividade do agente como referência |

## 4. Arquitetura desejada e como o referência externa ajuda

O objetivo é uma IA própria do Grupo Jadson, com interface própria, backend próprio, memória persistente, vários provedores (inclusive locais), agentes especializados, ferramentas, automações, pesquisa, análise de documentos, programação, controle de custos e segurança.

O referência externa acelera principalmente:
1. **Segurança e aprovações** (`approvals/`, `audit.ts`, `request-trust.ts`): o item de maior risco do nosso projeto, hoje ausente.
2. **Memória por pessoa com opt-out** (`memory/`, `learning/`): regras já pensadas, que evitam refazer o design do zero.
3. **Modelo de agentes e handoff**: evita reconstruir coordenação e escalonamento.
4. **Catálogo de provedores** (`model-providers.json`): um arquivo único lido por TypeScript e Python, o que facilita adicionar provedores locais.
5. **Política de navegador** (`computer/policy*.ts`): base para o browser isolado do nosso roadmap.

Não acelera muito: a interface (stack diferente), a infraestrutura de deploy e os adaptadores de frameworks que não usamos.

## 5. Plano de integração (proposta — nada implementado)

**1. Reutilizável diretamente (com atribuição MIT):** nenhum trecho de código está pronto para uso sem adaptação, porque a stack é outra. O que pode ser reaproveitado com menor esforço são documentos de design (`docs/approvals.md`, `docs/routines.md`, `docs/web-research.md`) e o arquivo `model-providers.json`, sempre com a atribuição do MIT e sem as marcas de fornecedores.

**2. Precisa ser adaptado:**
- Modelo de aprovação (`approvals/policy.ts`, `store.ts`) para a nossa API NestJS.
- Modelo de memória por pessoa e opt-out (`memory/defaults.ts`, `types.ts`), com armazenamento no Postgres atual e pgvector quando o roadmap pedir busca semântica.
- Handoff e limite de ferramentas (`agents/handoff-*.ts`, `tool-limit.ts`) para o módulo de agentes NestJS.
- Catálogo de provedores: portar a lógica para `apps/backend/src/modules/providers/`, mantendo nosso `provider.types.ts`.
- Política de rede do navegador (`computer/policy-network.ts`) para o browser isolado.
- Cliente MCP (`plugins/mcp.ts`) para o registro de ferramentas.

**3. Desenvolver do zero (com inspiração no referência externa):**
- Autenticação do Grupo Jadson (decisão de provedor ainda aberta).
- Adaptador de modelos locais via API compatível com OpenAI.
- Medição de tokens e custos por conversa, agente e pessoa.
- Interface de administração (`apps/web-admin` ainda é só um README).

**4. Não utilizar:**
- Workspace Bun, Hono, React 19 e Drizzle como base do projeto.
- Helm chart, Docker de produção e supervisor do referência externa.
- Os 17 adaptadores de framework externos e o `byo-url`.
- Extensão de navegador, app mobile, Twilio e voz (fora do escopo atual).
- Serviço referência externa Intelligence, até confirmação de licença e de dependência.
- Qualquer marca de fornecedor em `shared/marks/`.

**5. Dependências e conflitos:**
- Duas stacks de backend (NestJS e Hono) não devem coexistir. O NestJS fica.
- Dois ORMs (`pg` puro e Drizzle) exigem decisão. Recomendo manter `pg` por enquanto e avaliar Drizzle só quando o volume de migrations justificar.
- Licenças de dependências do referência externa precisam de levantamento (`pnpm licenses` ou equivalente) antes de qualquer reuso de código.
- Versões: React 18 (nosso) × React 19 (deles); Node 22 (nosso) × Bun (deles).

**6. Impacto na arquitetura atual:** exige um módulo de auth antes de qualquer outro reuso. Sem ele, aprovações e memória por pessoa não têm identidade confiável.

**7. Impacto no banco:** novas tabelas para usuários, sessões, aprovações, memória por pessoa e auditoria. As migrations 001 a 003 não mudam. Cada nova migration precisa de teste e revisão antes de rodar.

**8. Impacto na interface:** telas de login, de aprovação de ações, de memória do usuário e de administração. A identidade visual do Grupo Jadson permanece.

## 6. Conclusão técnica

O referência externa é uma referência valiosa para o que ainda falta no Grupo Jadson: autenticação, aprovação humana, memória por pessoa, handoff entre agentes, rotinas e política de navegador. Ele não é uma base para substituir o nosso código, porque a stack é outra e as dependências são muitas.

**Ordem recomendada de integração (cada etapa só com sua autorização):**
1. Levantar licenças das dependências e confirmar o status de referência externa Intelligence.
2. Validar o build do nosso monorepo no GitHub Actions (etapa 1 do diário).
3. Autenticação e autorização nas rotas do NestJS.
4. Aprovações de ação e auditoria, adaptadas do referência externa.
5. Medição de tokens e custos.
6. Adaptador de modelo local via API compatível com OpenAI.
7. Memória por pessoa com opt-out e, depois, busca semântica com pgvector.
8. Handoff entre agentes e limite de ferramentas.
9. Registro de ferramentas com MCP e política de navegador.
10. Rotinas em cron, por último.

**Aguardando autorização:** nenhuma integração foi implementada. Próximo passo sugerido: levantamento de licenças das dependências do referência externa, sem instalar nada localmente (pode ser feito pelo GitHub ou pela leitura dos manifests).
