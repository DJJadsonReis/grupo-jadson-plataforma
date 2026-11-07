# Auditoria do estado atual — Grupo Jadson

Data: 2026-11-07. Método: leitura estática de arquivos e código. **Nenhuma instalação, build ou teste foi executado neste computador.** Chaves e segredos não foram lidos nem expostos.

## A. Estado atual (o que existe de fato)

| Área | Situação verificada |
|---|---|
| Monorepo | pnpm 9.15.0 com `apps/desktop`, `apps/backend`, `apps/web-admin` (só README) e 9 pacotes em `packages/`. Só `packages/shared/src/chat.ts` tem código; os demais têm `.gitkeep`. |
| Backend | NestJS 10 + TypeScript, ~980 linhas em `apps/backend/src/modules`. Prefixo `/api/v1`, escuta em `127.0.0.1:3333`. |
| Desktop | Tauri 2 (Rust com `Cargo.toml`, `lib.rs`, `main.rs`, `tauri.conf.json`) + React + Vite. `App.tsx` tem 1.559 linhas, concentrando quase toda a interface. |
| Banco | PostgreSQL via `pg`, com 3 migrations: `agents`, `conversations`, `messages`, `agent_groups`, `group_participants`, mais colunas de vínculo e de ferramentas permitidas. pgvector é detectado, mas não é usado. |
| Cache/fila | Redis (`redis`) e adaptador de fila em memória. Não há BullMQ. |
| Provedor de IA | **Somente OpenAI**, via `fetch` direto em `/v1/chat/completions`, com streaming SSE. Modelo padrão `gpt-4o-mini`, configurável por `OPENAI_MODEL` ou pelo agente. `OPENAI_BASE_URL` permite apontar para outro endpoint compatível. |
| Agentes | CRUD completo (`agents.service.ts`), instruções de sistema, temperatura e `maxTokens` por agente, ativação/desativação e grupos com roteamento por menção (`group-routing.ts`). |
| Chat | Envio de mensagens com streaming, anexo de até 4 imagens por mensagem (validadas em `image-attachments.ts`), persistência de conversas no PostgreSQL com falha tratada como "best effort". |
| Health | `GET /api/v1/health` retorna o estado de PostgreSQL, pgvector e Redis. |
| Desktop ↔ backend | `App.tsx` lê e grava o espaço de trabalho em `localStorage` (`grupo-jadson.workspace.v1`) e mantém uma cópia local de conversas e agentes. |

## B. Funcionalidades: o que funciona e o que não funciona

**Existe no código (não verificado em execução):**
1. Conversa com OpenAI em streaming.
2. Histórico de conversas gravado no PostgreSQL (migration 001/002).
3. Agentes especializados configuráveis (nome, instruções, modelo, temperatura, máximo de tokens).
4. Grupos de agentes com roteamento por menção.
5. Anexo de imagem para modelos com visão.
6. Health check dos serviços de infraestrutura.

**Não existe ainda (diretórios vazios ou ausentes):**
- **Autenticação e usuários:** não há guard, JWT, sessão nem tabela de usuários. Qualquer cliente que alcance a API pode usar tudo. Como o bind é `127.0.0.1`, o risco atual é local, mas o desktop já consome a API sem nenhum controle de acesso.
- **Memória persistente:** `modules/memory` está vazio. Nenhuma memória entre sessões, por usuário ou por agente. O histórico de conversa é apenas registro.
- **Ferramentas:** `modules/tools` e `packages/tool-registry` estão vazios. Não há execução de ferramenta, nem browser, filesystem ou terminal.
- **Orquestração e delegação entre agentes:** não há runtime de agente (`packages/agent-runtime` vazio). Os grupos apenas escolhem quem responde por menção.
- **Automações:** `modules/automations` vazio. Não há agendamento nem webhook.
- **Painel administrativo:** `apps/web-admin` tem apenas README.
- **Custos e tokens:** nenhuma medição de uso ou custo. O provedor não lê `usage` da resposta nem grava consumo.
- **Fallback entre provedores:** não existe. Há um único adaptador.
- **Modelos locais:** não existem adaptadores (Ollama, llama.cpp etc.).
- **Cache de respostas:** não existe.
- **Seleção de modelo:** o modelo vem do pedido, do agente ou da variável de ambiente. Não há catálogo nem escolha automática.
- **Configuração de provedores pela interface:** não existe. A chave é lida de `OPENAI_API_KEY` no ambiente do backend.
- **Pesquisa na web e leitura de arquivos:** não existem.
- **WebSocket:** não existe; o streaming é feito por SSE.

## C. Problemas e riscos encontrados

1. **Sem autenticação nem autorização** em nenhuma rota (`chat`, `agents`, `groups`, `conversations`). Bloqueante antes de qualquer uso fora da máquina local.
2. **Sem limite de custo ou de tokens por usuário/agente.** `maxTokens` existe por agente, mas não há teto global nem quota.
3. **Chave da OpenAI em variável de ambiente sem cofre.** Adequado para desenvolvimento; a documentação de segurança já exige criptografia em repouso.
4. **Erros de persistência são só logados.** Em `chat.controller.ts`, falhas ao gravar mensagens não interrompem o chat. Isso protege a resposta ao usuário, mas pode deixar o histórico incompleto sem aviso visível.
5. **Fila e persistência de estado.** O `health` mostra "process-memory" quando o Redis não está ativo; nesse caso os dados de fila se perdem ao reiniciar.
6. **Interface concentrada.** `App.tsx` com 1.559 linhas dificulta manutenção e testes. As pastas `components/` e `pages/` estão vazias.
7. **CSP do Tauri** permite `connect-src` para `localhost:3333` e `127.0.0.1:3333` fixos. Trocar a porta exige alterar a configuração do app.
8. **Testes nunca executados.** Há 8 arquivos de teste (`*.spec.ts` e `*.test.ts`), mas nenhum foi rodado neste ambiente. Não há testes de autorização, de isolamento nem de memória.
9. **Dependências.** Versões com `^` e lockfile presente. Não foi feita auditoria de vulnerabilidades (`pnpm audit`), pois exige instalação.
10. **Ambiente de build.** Rust/Cargo, pnpm 9.15.0 e dependências não foram confirmados neste PC. Os workflows do GitHub são a forma prevista de validar.
11. **Documentação desatualizada.** O `ROADMAP.md` marca como não feitas coisas que já existem parcialmente (ex.: CRUD de agentes, persistência de conversas), e vice-versa para o item "Instalar dependências e validar workspace", que segue pendente.

## D. Tecnologias e integrações

- Linguagens: TypeScript (backend, desktop, pacotes), Rust (shell Tauri), PowerShell (scripts de setup).
- Frameworks: NestJS 10, React 18, Vite 6, Tauri 2, Jest (backend), Vitest (desktop).
- Banco: PostgreSQL (com pgvector previsto). Cache/fila: Redis e fila em memória.
- IA: OpenAI (Chat Completions, streaming, visão por `image_url`).
- Infra: `docker-compose.yml` com PostgreSQL/pgvector e Redis apenas para desenvolvimento.
- CI: 5 workflows manuais em `.github/workflows` (typecheck, testes do backend, build do frontend, build Windows com Tauri e geração do lockfile). Usam Windows, Node 22 e pnpm 9.15.0.

## E. Custos previstos

- **OpenAI:** cobrança por token. Não há medição no código; o custo real só poderá ser estimado após instrumentar `usage`.
- **Infraestrutura:** PostgreSQL e Redis locais são gratuitos. Hospedagem, TLS e backups ainda não existem e terão custo ao chegar à fase de cloud.
- **GitHub Actions:** consumo de minutos nos workflows manuais.

## F. Próximas etapas (ordem sugerida)

1. Validar o workspace: instalar com `pnpm install --frozen-lockfile` e rodar typecheck e testes via GitHub Actions.
2. Autenticação mínima e autorização nas rotas (exigência antes de qualquer uso fora da máquina local).
3. Medição de tokens e custo por conversa, agente e usuário, lendo `usage` da resposta.
4. Segunda interface de provedor (ex.: Ollama para modelos locais) sob o contrato comum já previsto em `provider.types.ts`.
5. Fallback simples entre provedores.
6. Memória persistente por usuário e por agente, com pgvector.
7. Registro de ferramentas com allowlist e aprovação humana.
8. Orquestração e delegação entre agentes com auditoria.
9. Refatorar `App.tsx` em componentes e cobrir com testes.

## G. Prioridades

- **Alta:** validar o build no CI; autenticação; medição de custo.
- **Média:** provedor local; fallback; memória por agente; atualizar o roadmap.
- **Baixa:** automações, painel administrativo, cloud e distribuição.

## H. Plano de continuidade

Retomar pela etapa 1 do `ACOMPANHAMENTO_DESENVOLVIMENTO.md`: disparar o workflow `typecheck.yml` no GitHub (repositório privado, exige login no navegador do app) e corrigir o que o log apontar. Só depois avançar para autenticação e medição de custo.
