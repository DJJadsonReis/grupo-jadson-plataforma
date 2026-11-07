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

## Atualização — auditoria referência externa e integração AG-UI (2026-11-03)

- [x] Inspecionar a cópia local `Exemplo referência externa`, seus manifests, README e licença MIT.
- [x] Comparar capacidades referência externa com os módulos, migrations, pacotes e workflows Grupo Jadson.
- [x] Registrar compatibilidade/licenciamento em `docs/AUDITORIA_REFERENCIAS_INTEGRACAO.md` e `CREDITS.md`.
- [x] Documentar que o stream SSE existente não é AG-UI e que a integração ainda não está operacional.
- [ ] Definir e implementar contrato/run AG-UI no NestJS, com testes de eventos e cancelamento.
- [ ] Validar CRUD e migration 002 em PostgreSQL e executar typecheck/testes/build.
- [ ] Implementar memória individual, gateway auditável de ferramentas, execução isolada e rotinas somente após contratos e testes.

**Validação desta atualização:** inspeção estática de arquivos/manifests e documentação. `pnpm`, `node_modules` e Git não estão disponíveis neste ambiente; nenhuma suite, build ou execução remota de workflow foi realizada. Nenhum código do referência externa foi copiado e nenhuma dependência foi adicionada.

## Atualização — retomada da validação e ambiente portátil (2026-11-03)

- [x] Confirmar estado inicial do Git: `main` acompanhava `origin/main`, sem alterações antes desta atualização documental.
- [x] Confirmar Node.js 22.23.4 no diretório portátil, npm 10.9.9 e SHA-256 do ZIP igual ao `SHASUMS256.txt` oficial; não houve novo download.
- [x] Executar pnpm exatamente 9.15.0 pelo Corepack em `.cache/pnpm/corepack`.
- [x] Validar 15 `package.json` e 15 arquivos JSON de configuração: zero inválidos.
- [ ] Gerar lockfile: bloqueado no modo offline pela falta de metadados para `prettier@>=3.4.2 <4.0.0-0` (`ERR_PNPM_NO_OFFLINE_META`). Nenhum lockfile foi criado.
- [ ] Typecheck, testes backend/desktop e builds: comandos executados, todos encerraram com código 1 porque as dependências não estão instaladas (`tsc`, `jest`, `vitest` e `nest` ausentes).
- [ ] Build Tauri: Rust/Cargo, MSVC Build Tools e Windows SDK não localizados. WebView2 Runtime está presente. PostgreSQL e Redis portáteis não localizados.

A documentação registra falhas reais, não aprova funcionalidades com base apenas em leitura estática. Próximo bloqueio a resolver é disponibilizar metadata e pacotes de dependências compatíveis com pnpm 9.15.0, revisar o lockfile gerado e então repetir a sequência de validação.

## Atualização — CI remoto Windows (2026-11-03)

- [x] Separar bootstrap manual do lockfile, sem lifecycle scripts, com artifact para revisão e verificação de manifests.
- [x] Configurar validação de typecheck, testes backend/desktop e frontend para pull requests e execução manual, com instalação congelada.
- [x] Configurar backend CI em runner Linux com PostgreSQL 16 e Redis 7.2 descartáveis, migrations e smoke tests de persistência via API.
- [x] Configurar cadeia de push em `main`: backend integration como gate, typecheck, testes desktop, build frontend/backend e empacotamento Tauri MSI/NSIS em `windows-latest`.
- [x] Adicionar cache pnpm/Rust, logs/relatórios como artifacts e metadata de versão/commit/arquitetura; instaladores com retenção de 90 dias.
- [ ] Obter e revisar o artifact inicial `pnpm-lock.yaml`; adicionar a versão aprovada à branch antes de qualquer instalação congelada.
- [ ] Publicar os workflows locais por um commit/push autorizado e confirmar execuções reais no GitHub Actions.
- [ ] Validar artifact MSI/NSIS; não há instalador gerado por esta edição local.

**Estado de validação:** edição estática dos YAML/configuração local. Não foi possível executar GitHub Actions nem obter artifacts porque os workflows não foram publicados. As execuções antigas do repositório falharam em `startup_failure` sem iniciar jobs. Nenhum teste/build remoto novo foi executado.
# CI remoto — estado da fase 3 (2026-11-03)

- Local e `origin/main` estavam no mesmo commit (`af7855233766c624a7e3ae4d0d9610ffb4c775ba`); a diferença é de árvore de trabalho, não de histórico.
- O remoto ainda contém `generate-lockfile.yml`; `bootstrap-lockfile.yml` e demais mudanças locais permanecem sem publicação.
- Bootstrap, artifact do lockfile, testes e build Windows não foram executados nesta fase. A execução de processos locais falhou por erro do ambiente; actionlint não foi executado.
- Próximo marco: após autorização para publicar, disponibilizar workflows, executar bootstrap manual, revisar o artifact do lockfile e só então rodar validações congeladas e build Tauri Windows.
