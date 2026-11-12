# Plano de continuidade — Grupo Jadson

Este documento diz onde o projeto está e o que fazer ao baixá-lo de novo.

## 1. Como voltar a rodar

Pré-requisitos (tudo gratuito, instalado dentro da pasta do projeto):
- Node.js (já instalado no computador) e pnpm em `tools/pnpm`.
- Rust em `tools/rust` e MinGW em `tools/mingw` (para gerar o `.exe`).
- PostgreSQL portátil em `tools/pg` (pacote npm `@embedded-postgres/windows-x64` 16.15.0-beta.19). Esta pasta não vai para o git.

Arquivos de ambiente (não vão para o git):
- `apps/backend/.env`: `API_TOKEN`, `API_PORT=3333`, `API_HOST=127.0.0.1`, `DATABASE_URL=postgres://gj:<senha>@127.0.0.1:55432/grupo_jadson`, e opcionalmente `TAVILY_API_KEY`.
- `apps/desktop/.env.local`: `GJ_DEV_API_TOKEN` com o mesmo valor de `API_TOKEN` (só desenvolvimento; não usa prefixo `VITE_`, então não vai para o bundle).

Subir o banco local (uma vez por sessão):
```
tools\pg\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe -D tools\pg\data -o "-p 55432 -h 127.0.0.1" -l tools\pg\server.log start
```
Parar: o mesmo `pg_ctl.exe` com `stop`.

Backend e desktop:
```
pnpm --filter @grupo-jadson/backend dev        # API em 127.0.0.1:3333
pnpm --filter @grupo-jadson/desktop exec vite  # interface em localhost:1420
cd apps/desktop && pnpm exec tauri build       # gera o .exe
```
O `.exe` fica em `apps/desktop/src-tauri/target/release/grupo-jadson.exe`.

Verificações: `pnpm --filter @grupo-jadson/backend test` (58 testes) e `run typecheck` em backend e desktop.

## 2. O que já está pronto (na `main`)

- **Layout:** chat como tela inicial, barra lateral com conversas em duas linhas e busca, painel de contexto ao lado do chat, Galeria de Agentes, Monitoramento, Configurações, Atividades. Barras de rolagem escuras.
- **F2 — Usuários e papéis:** administrador, operador e leitor, cada um com token próprio (só o hash é guardado). O token do sistema (`API_TOKEN`) age como administrador. Tela em Configurações → Pessoas e acessos.
- **F3 — Auditoria e aprovação:** trilha de eventos; ações sensíveis esperam aprovação na tela Atividades.
- **F4 — Consumo:** tokens por agente, em Atividades.
- **F6 — Memória por pessoa:** salvar, esquecer e desligar (opt-out). Memórias ligadas entram como contexto do chat.
- **F7 — Delegação entre agentes:** botão Delegar no chat, limite de 3 delegações por conversa, registro na auditoria.
- **F8 — Ferramentas:**
  - Ferramentas internas: hora atual, listar memórias, apagar memórias (sensível).
  - Servidor MCP de arquivos oficial, limitado a `workspace/` (escrita exige aprovação).
  - Busca na web: `busca.wikipedia` (sem chave) e `busca.web` (Tavily, precisa da chave).
  - Rotinas agendadas com ferramentas de leitura (rodam a cada N minutos).
- **F9 — PDF:** anexar PDF no chat; o texto é extraído pelo backend.
- **Chave do Tavily:** pode ser colada em Configurações → Busca na web. Fica no banco local, cifrada (AES-256-GCM); a chave de cifragem é `CREDENTIAL_KEY` no `apps/backend/.env`, criada na primeira vez.

## 3. O que falta

- **Testar com a chave real do Tavily.** Hoje só foi testado o erro 401 com chave falsa.
- **Testar o anexo de PDF pelo navegador.** O backend foi testado; a tela, não.
- **F5 — Provedores:** Anthropic e Google precisam de chave paga; ficam para quando houver orçamento. O endpoint local compatível com OpenAI já existe.
- **Licença do servidor de arquivos MCP:** o README diz MIT, mas o pacote não traz arquivo de licença. Conferir antes de distribuir.
- **CI no GitHub:** bloqueado por cobrança da conta. Nenhuma verificação automática roda até isso ser resolvido.
- **Pendências no git:** `OpenBot/` (referência, 56 MB), `.claude/`, `apps/desktop/src-tauri/Cargo.lock` e `gen/`. Decidir se entram no repositório.
- **PRs antigos:** PR #1 (`feat/auth-api-token`) continua aberto. Branches já mergeadas podem ser apagadas.

## 4. Histórico relevante

- PRs mergeados: #2, #3, #4, #5. Desde o PR #5, os commits vêm direto na `main`, a pedido do dono.
- Banco de teste local: usuários, agentes e conversas de teste foram apagados. As rotinas e ferramentas de teste também.
- `apps/studio/` foi removido do projeto: não tinha relação com este projeto.
