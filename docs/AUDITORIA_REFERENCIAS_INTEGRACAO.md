# Auditoria referência externa, AG-UI e redesign

Data: 2026-11-03
Escopo: inspeção estática do monorepo Grupo Jadson e da cópia local `Exemplo referência externa`. Nenhuma dependência foi instalada e nenhum serviço externo foi conectado.

## Resumo

O Grupo Jadson já tem uma base React/Tauri e NestJS com perfis de agente, conversas com associação opcional a agente, streaming SSE de provedor e uma navegação redesenhada. O exemplo referência externa é um template independente, não uma biblioteca pronta para encaixar: declara Bun 1.4.3, React 19, Hono, referência externa Intelligence, infraestrutura Docker e serviços próprios. O Grupo Jadson fixa pnpm 9.15.0, React 18, NestJS, Tauri 2, PostgreSQL e Redis. Não se deve transplantar o workspace ou suas dependências.

AG-UI é adequado como contrato de eventos do runtime entre backend e cliente. Deve ser integrado atrás do NestJS, mantendo a autoridade do backend para autenticação, persistência, seleção de agente, permissões e auditoria. Hoje o chat encaminha SSE OpenAI compatível; isso ainda não é uma implementação AG-UI.

## Comparação por capacidade

| Área | Grupo Jadson observado | referência externa observado | Ação/adaptação recomendada |
|---|---|---|---|
| Desktop e interface | React 18 + Vite + Tauri 2; dashboard, navegação lateral recolhível, agentes, conversas e chat | React 19, Vite e workspace desktop próprio | Preservar UI, logo e dependências existentes. Usar padrões de navegação e visualização de atividade como referência, sem copiar ativos. |
| API | NestJS modular | Hono, runtime referência externa e serviços próprios | Manter NestJS. Colocar adaptação AG-UI no módulo de execução sem expor credenciais ao desktop. |
| Agentes | CRUD básico em PostgreSQL e fallback local do desktop; configuração de perfil | Bots como configuração, endpoints AG-UI e computadores próprios | Evoluir schema/API com estado de runtime separado do campo `enabled`; não inferir estado operacional de perfil habilitado. |
| Conversas | Histórico PostgreSQL, vínculo opcional `agent_id` via migration 002, espelho local; streaming SSE atual | Canais e threads via integrações referência externa | Preservar histórico atual e testar migration. Planejar eventos AG-UI sem descartar o protocolo atual antes da compatibilidade. |
| Memória | Módulo backend vazio (`.gitkeep`); pacote `memory-engine` sem implementação | Integração de memória/learning depende da arquitetura referência externa | Projetar memória por agente no PostgreSQL e definir retenção/isolamento; não assumir dependência de serviço externo. |
| Ferramentas e segurança | Pacotes `tool-registry` e `security` são scaffolds; princípios descritos em docs | Gateway central, política, auditoria e computadores isolados | Reutilizar o conceito de decisão central e registro pré/pós ação; implementar deny-by-default, escopo por agente e aprovação antes de executar. |
| Rotinas e filas | Módulo de automações e adaptadores Redis/memória existentes em estágio inicial; não há prova de agendamento operacional | Worker de rotinas e cron em stack própria | Especificar persistência, disparo, cancelamento e auditoria antes de expor controles de rotina como funcionais. |
| Persistência | PostgreSQL e migrations próprios; Redis opcional para fila | PostgreSQL + serviços referência externa/Drizzle | Manter PostgreSQL/Redis. Não importar esquema ou serviço de memória do referência externa sem decisão e migração revisada. |

## Componentes reutilizáveis do próprio Grupo Jadson

- `apps/desktop/src/App.tsx` e componentes em `apps/desktop/src/components`: navegação e telas que podem evoluir de forma incremental.
- `apps/desktop/src/lib/workspace.ts`: modelo e persistência local retrocompatível.
- `apps/backend/src/modules/agents`: CRUD PostgreSQL dos perfis.
- `apps/backend/src/modules/chat`: conversas e proxy SSE ao gateway de provedores.
- `apps/backend/src/modules/database/migrations`: migrations 001 e 002, esta última liga conversa e agente sem apagar registros.
- `apps/backend/src/modules/queue`: interface de fila e implementações Redis/memória existentes; status precisa ser confirmado por execução.
- `packages/agent-runtime`, `packages/memory-engine`, `packages/tool-registry` e `packages/security` são pontos de extensão, mas seus diretórios-fonte ainda são scaffolds.

## Funcionalidades ausentes ou não comprovadas

- Eventos AG-UI ponta a ponta; o stream existente é SSE com payload OpenAI compatível.
- Grupo/coordenador de agentes, delegação/subagentes, ciclo de aprovação e histórico de execução.
- Estado persistente de execução (ocioso, pensando, trabalhando, aguardando, bloqueado e concluído) baseado em runs reais.
- Memória individual operacional, indexação e política de retenção.
- Gateway de ferramentas com autorização, auditoria e execução isolada; navegador/computador do agente.
- Rotinas agendadas persistentes, recorrência, pausa, retries e histórico.
- Upload e transporte de anexos: a UI aceita seleção local, mas ainda não envia arquivos ao backend.
- Migração 002, sincronização de agente/conversa, testes, typecheck e builds não foram executados nesta auditoria.

## Dependências e compatibilidade

- referência externa declara `packageManager: bun@1.4.3`, workspaces próprios, `pacote-externo`, `@ag-ui/*`, Hono, Drizzle, referência externa Intelligence e dependência do Docker. A configuração de início documenta também PostgreSQL, Bot computers e credenciais de modelo.
- Grupo Jadson declara `packageManager: pnpm@9.15.0`; desktop com React 18/Vite 6/Tauri 2; backend NestJS 10; adaptadores `pg` e `redis`. Não há `pnpm-lock.yaml` no momento da inspeção.
- Não copiar `node_modules`, configurações, secrets, tenant, assets ou containers do exemplo. Não adicionar dependências referência externa/referência externa só para imitar as telas.
- Tauri, PostgreSQL e Redis permanecem na arquitetura oficial. Nenhum runtime foi iniciado nesta auditoria.

## Repositório e validação

- A cópia `Exemplo referência externa` contém 2.668 caminhos listados por `rg --files`; seu README e sua licença MIT foram lidos. Nenhuma alteração foi feita nela.
- Não encontrei metadados/configuração `.git` legíveis nem o comando `git` disponível nesta sessão; a conexão com `DJJadsonReis/grupo-jadson-plataforma`, branch e workflows remotos não foi confirmada. Não houve commit nem push.
- `pnpm` e `node_modules` não estão disponíveis no projeto; testes, typecheck, build e capturas React não foram executados.
- Workflow files presentes: `test-backend.yml`, `build-frontend.yml`, `typecheck.yml`, `build-windows.yml` e `generate-lockfile.yml`. A inspeção desta etapa apenas confirmou presença, não execução em Actions.

## Fontes

- [referência externa — Artigo de design de agentes persistentes](https://example.invalid/referencia)
- [referência externa — README](https://github.com/referência externa/referencia-externa) e [licença MIT](https://github.com/referência externa/referencia-externa/blob/main/LICENSE)
- [referência externa — repositório](https://example.invalid/referencia) (Apache-2.0 declarado pelo projeto)
- [AG-UI — introdução](https://docs.ag-ui.com/introduction) e [arquitetura](https://docs.ag-ui.com/concepts/architecture)

## Próximos passos incrementais

1. Consolidar contrato de execução/run e eventos AG-UI, com validação e testes do parser de eventos antes de alterar o streaming do desktop.
2. Validar migrations 001/002 e CRUD de agentes/conversas em PostgreSQL de desenvolvimento com backup/instância descartável.
3. Definir tabelas e limites de memória, aprovação, auditoria e rotinas antes de construir telas operacionais.
4. Executar typecheck/testes/build no ambiente compatível; registrar screenshots do React apenas após build real.
