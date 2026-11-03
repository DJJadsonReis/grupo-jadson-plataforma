# Roadmap de implementação

## Fase 1 — Fundamentação
- [x] Estrutura inicial do monorepo
- [x] Documentação arquitetural inicial
- [x] Exemplo de variáveis de ambiente
- [x] Docker Compose para PostgreSQL/pgvector e Redis
- [ ] Instalar dependências e validar workspace
- [ ] Definir ADRs e modelo inicial de dados

**Aceite:** instalação reproduzível, containers saudáveis e documentação revisada.

## Fase 2 — Desktop e identidade
- [ ] Bootstrap Tauri 2 + React
- [ ] Integrar logo oficial e tema dark/dourado
- [ ] Sidebar, dashboard e chat inicial
- [ ] Estados de conexão e erros

**Aceite:** desktop inicia, navegação funciona e layout responde a diferentes resoluções.

## Fase 3 — Backend
- [ ] NestJS, health check e configuração
- [ ] PostgreSQL e migrações
- [ ] Autenticação e sessões
- [ ] WebSocket

## Fase 4 — Gateway de IA
- [ ] Contrato comum de provedores
- [ ] Primeiro adaptador real
- [ ] Streaming e cancelamento
- [ ] Medição de tokens/custos e fallback

## Fase 5 — Multiagentes e memória
- [ ] CRUD de agentes
- [ ] Memória por agente
- [ ] Orquestrador e subagentes
- [ ] Limites e auditoria

## Fase 6 — Ferramentas
- [ ] Registro de ferramentas e schemas
- [ ] Browser isolado
- [ ] Filesystem com sandbox
- [ ] Terminal em container com política de allowlist
- [ ] Aprovação humana

## Fase 7 — Automações
- [ ] BullMQ e agendamentos
- [ ] Webhooks autenticados
- [ ] Histórico e retries

## Fase 8 — Cloud
- [ ] Workers remotos
- [ ] Deploy, HTTPS e storage
- [ ] Sincronização desktop/cloud

## Fase 9 — Segurança e qualidade
- [ ] Testes de autorização e isolamento
- [ ] Threat modeling e revisão de prompt injection
- [ ] Backups e restauração
- [ ] Observabilidade

## Fase 10 — Distribuição
- [ ] Build e instalador Windows
- [ ] Builds macOS/Linux
- [ ] Atualizações e documentação de operação

## Atualização — redesign orientado a agentes (2026-11-03)

- [x] Auditar a UI React/Tauri, contratos NestJS, persistência e dependências.
- [x] Registrar o ADR do workspace orientado a agentes.
- [x] Redesenhar navegação, sidebar retrátil, roster de perfis, dashboard e lista de conversas.
- [x] Integrar chamadas CRUD de agentes na UI e manter cópia local/fallback (execução de validação pendente).
- [x] Implementar migração aditiva e contrato `agentId` para conversas (aplicação em PostgreSQL e validação pendentes).
- [ ] Implementar eventos AG-UI, grupos, rotinas, memória individual e gateway de ferramentas com auditoria.
- [ ] Executar typecheck/testes/build e capturar telas reais da UI redesenhada.

O desktop React/Tauri segue como produto principal. A demonstração WinForms em `dist/windows` não é build nem evidência visual das alterações React.

## Atualização — auditoria OpenBot e integração AG-UI (2026-11-03)

- [x] Inspecionar a cópia local `Exemplo OpenBot`, seus manifests, README e licença MIT.
- [x] Comparar capacidades OpenBot com os módulos, migrations, pacotes e workflows Grupo Jadson.
- [x] Registrar compatibilidade/licenciamento em `docs/AUDITORIA_OPENBOT_INTEGRACAO.md` e `CREDITS.md`.
- [x] Documentar que o stream SSE existente não é AG-UI e que a integração ainda não está operacional.
- [ ] Definir e implementar contrato/run AG-UI no NestJS, com testes de eventos e cancelamento.
- [ ] Validar CRUD e migration 002 em PostgreSQL e executar typecheck/testes/build.
- [ ] Implementar memória individual, gateway auditável de ferramentas, execução isolada e rotinas somente após contratos e testes.

**Validação desta atualização:** inspeção estática de arquivos/manifests e documentação. `pnpm`, `node_modules` e Git não estão disponíveis neste ambiente; nenhuma suite, build ou execução remota de workflow foi realizada. Nenhum código do OpenBot foi copiado e nenhuma dependência foi adicionada.
