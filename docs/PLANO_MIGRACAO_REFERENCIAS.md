# Plano de migração do referência externa para o Grupo Jadson

Data: 2026-11-07. Status: **plano para aprovação**. Autorização recebida para trabalhar dentro de `T:\grupo-jadson`.

## 0. Salvaguarda feita

Snapshot completo do projeto antes de qualquer alteração: `T:\grupo-jadson\.backups\pre-referencia-externa-2026-11-07` (3.340 arquivos, 58 MB, sem `node_modules`). Para restaurar: copiar a pasta de volta sobre o projeto. O snapshot fica dentro do projeto e não deve ser versionado (incluir `.backups/` no `.gitignore` ao restaurar o Git).

## 1. Escopo realista

"Migrar tudo do referência externa" não é seguro nem fechável sem executar nada localmente. O referência externa tem 3.202 arquivos em outra stack (Bun, Hono, React 19, Drizzle), e cada módulo depende de outros. Portanto a migração será feita por fases, cada uma só concluída com build e testes verificados pelo GitHub Actions (você pediu não rodar nada aqui).

Restrições que continuam valendo:
- Não trocar NestJS, pnpm, React 18 nem Tauri 2 do nosso projeto.
- Não copiar marcas de fornecedores (`shared/marks/`).
- Não copiar `.env`, credenciais, chaves nem o serviço referência externa Intelligence.
- Licença MIT do referência externa exige manter o aviso de copyright junto do código copiado (criar `THIRD_PARTY_NOTICES.md`).
- Dependências de terceiros só entram após levantamento de licença.

## 2. Fases

| Fase | Conteúdo | Origem no referência externa | Pronto quando |
|---|---|---|---|
| F0 | Snapshot, licenças, notice MIT | `LICENSE`, manifests | Snapshot feito (ok); notice criado |
| F1 | Layout estilo referência de mercado: sidebar recolhível, área central de chat, campo de entrada fixo, modo tela cheia e tema escuro dourado | referência de navegação em `app/` e `desktop/` (padrões, não código) | Tela renderiza no desktop e no celular; identidade visual preservada |
| F2 | Autenticação e permissões (sessão, papéis) | `server/src/auth`, `identity` | Rotas protegidas; testes de autorização |
| F3 | Aprovação humana de ações e auditoria | `approvals/`, `audit.ts` | Ação sensível pede aprovação; log gravado |
| F4 | Medição de tokens e custos | `model-billing.ts` (ler, reescrever) | Uso gravado por conversa e agente |
| F5 | Provedores: contrato comum + Anthropic + Google + endpoint local compatível com OpenAI | `shared/model-providers.json` | Escolha de modelo e fallback testados |
| F6 | Memória por pessoa com opt-out | `server/src/memory/` | Lembrar, esquecer, separar por usuário |
| F7 | Handoff entre agentes e limite de ferramentas | `agents/handoff-*`, `tool-limit.ts` | Delegação registrada e limitada |
| F8 | Ferramentas (MCP) e rotinas em cron | `plugins/mcp.ts`, `routines/` | Só após F2 e F3 |
| F9 | Análise de documentos (PDF/Office) | não existe no referência externa | Biblioteca escolhida com licença verificada |

## 3. Layout tipo referência de mercado (F1): proposta

Referência genérica de padrão de interface de chat de IA (não copiar visual de terceiros):
- Coluna lateral à esquerda com lista de conversas e agentes; recolhível para ícones.
- Área central com mensagens em largura de leitura, rolagem própria.
- Campo de entrada fixo embaixo, com anexos e seleção de modelo.
- Modo foco: oculta a lateral e expande o chat.
- Modo tela cheia e responsivo, com identidade dourada do Grupo Jadson (`#D4A017`, `#F5CE55`) e logo oficial.

Decisão necessária: você quer só o layout (F1) agora, ou também as fases de segurança (F2 e F3)? Recomendo começar por F0 e F1, que não mexem em dados nem em segurança, e depois F2 antes de qualquer outra fase.

## 4. Verificação

Cada fase termina com `typecheck`, testes e build executados pelo GitHub Actions (`typecheck.yml`, `test-backend.yml`, `build-frontend.yml`). Não há como verificar a UI aqui sem rodar o app.

## 5. Pendências que bloqueiam

- Repositório Git: pasta `.git` ausente; antes de versionar as fases é preciso restaurar o histórico (ver `docs/LOCALIZACAO_REPOSITORIO_GIT.md`).
- Login no GitHub no navegador do app, para disparar os workflows.
- Confirmação do nome do repositório remoto (`grupo-jadson-plataforma` ou `grupo-jadson-platform`).
