# Plano de migração do referência externa para o Grupo Jadson

Data: 2026-11-07. Status atualizado em **2026-11-12** (ver seção 6). Autorização recebida para trabalhar dentro de `T:\grupo-jadson`.

## 0. Salvaguarda

- **Snapshot de 2026-11-07 (`.backups\pre-referencia-externa-2026-11-07`):** não existia no disco quando verificado em 2026-11-12. Nunca foi possível confirmar se foi criado ou apagado; não há como restaurá-lo a partir dele.
- **Backup novo de 2026-11-12:** `T:\backups\grupo-jadson-2026-11-12` (cópia do projeto, incluindo `.git` e os `.env`, sem `node_modules`, `dist`, `target`, `.runtime` e `.cache`; 77.618 arquivos, conferidos um a um com a origem) e `T:\backups\grupo-jadson-2026-11-12.bundle` (histórico Git completo, verificado com `git bundle verify`). O bundle não inclui alterações sem commit; essas estão na cópia de pasta.
- A pasta `.backups/` agora está no `.gitignore`, caso um snapshot seja recriado dentro do projeto.

## 1. Escopo realista

"Migrar tudo do referência externa" não é seguro nem fechável sem executar nada localmente. O referência externa tem 3.202 arquivos em outra stack (Bun, Hono, React 19, Drizzle), e cada módulo depende de outros. Portanto a migração será feita por fases, cada uma só concluída com build e testes verificados pelo GitHub Actions (você pediu não rodar nada aqui).

Restrições que continuam valendo:
- Não trocar NestJS, pnpm, React 18 nem Tauri 2 do nosso projeto.
- Não copiar marcas de fornecedores (`shared/marks/`).
- Não copiar `.env`, credenciais, chaves nem o serviço referência externa Intelligence.
- Licença MIT do referência externa exige manter o aviso de copyright junto do código copiado (criar `THIRD_PARTY_NOTICES.md`).
- Dependências de terceiros só entram após levantamento de licença.

## 2. Fases

| Fase | Conteúdo | Origem no referência externa | Pronto quando | Status real (2026-11-12) |
|---|---|---|---|---|
| F0 | Snapshot, licenças, notice MIT | `LICENSE`, manifests | Snapshot feito; notice criado | **Feita.** Notice em `THIRD_PARTY_NOTICES.md` (`e7c442f`). Snapshot de 2026-11-07 não existe; backup novo em `T:\backups` (seção 0) |
| F1 | Layout estilo referência de mercado: sidebar recolhível, área central de chat, campo de entrada fixo, modo tela cheia e tema escuro dourado | referência de navegação em `app/` e `desktop/` (padrões, não código) | Tela renderiza no desktop e no celular; identidade visual preservada | **Parcial.** Código commitado (`09d8fea`, `efa33ae`, `0bf6b21`). Validação visual não feita: o Tauri não roda neste computador. Falta conferir no desktop e no celular |
| F2 | Autenticação e permissões (sessão, papéis) | `server/src/auth`, `identity` | Rotas protegidas; testes de autorização | **Parcial.** Papéis (admin, operador, leitor) e tokens por pessoa implementados; testes para o guard e para usuários existem. Cobertura de todas as rotas não confirmada. Token do sistema saiu do bundle (`d7c472f`); pendências em `docs/SECURITY.md` |
| F3 | Aprovação humana de ações e auditoria | `approvals/`, `audit.ts` | Ação sensível pede aprovação; log gravado | **Parcial.** Aprovação e auditoria implementadas e aplicadas a Notion, Computador do Bot e Google (Agenda e Drive). Cobertura das demais ações não confirmada |
| F4 | Medição de tokens e custos | `model-billing.ts` (ler, reescrever) | Uso gravado por conversa e agente | **Parcial.** Serviço de uso e migração 004 existem; uso por agente aparece em Atividades. Granularidade por conversa não confirmada |
| F5 | Provedores: contrato comum + Anthropic + Google + endpoint local compatível com OpenAI | `shared/model-providers.json` | Escolha de modelo e fallback testados | **Parcial.** Endpoint compatível com OpenAI, Gemini e Ollama. **Anthropic não existe no código.** Fallback sem teste |
| F6 | Memória por pessoa com opt-out | `server/src/memory/` | Lembrar, esquecer, separar por usuário | **Parcial.** Lembrar e esquecer existem (`memory.service`). Opt-out não confirmado |
| F7 | Handoff entre agentes e limite de ferramentas | `agents/handoff-*`, `tool-limit.ts` | Delegação registrada e limitada | **Parcial.** Serviço de delegação com limite de 3 por conversa e registro na auditoria. Política de ferramentas em `agent-policy` |
| F8 | Ferramentas (MCP) e rotinas em cron | `plugins/mcp.ts`, `routines/` | Só após F2 e F3 | **Parcial.** MCP por stdio. Rotinas usam `setInterval`, não cron de verdade |
| F9 | Análise de documentos (PDF/Office) | não existe no referência externa | Biblioteca escolhida com licença verificada | **Parcial.** Só PDF (`pdf-parse`). DOCX e XLSX não implementados |

## 3. Layout tipo referência de mercado (F1): proposta

Referência genérica de padrão de interface de chat de IA (não copiar visual de terceiros):
- Coluna lateral à esquerda com lista de conversas e agentes; recolhível para ícones.
- Área central com mensagens em largura de leitura, rolagem própria.
- Campo de entrada fixo embaixo, com anexos e seleção de modelo.
- Modo foco: oculta a lateral e expande o chat.
- Modo tela cheia e responsivo, com identidade dourada do Grupo Jadson (`#D4A017`, `#F5CE55`) e logo oficial.

Decisão necessária: você quer só o layout (F1) agora, ou também as fases de segurança (F2 e F3)? Recomendo começar por F0 e F1, que não mexem em dados nem em segurança, e depois F2 antes de qualquer outra fase.

## 4. Verificação

Cada fase termina com `typecheck`, testes e build. Em 2026-11-12 os testes passaram localmente (ver seção 6). A UI só pode ser verificada rodando o app.

## 5. Pendências

- Validação visual do layout (F1) no desktop e no celular.
- Decisão sobre rotação do `API_TOKEN` e sobre a entrega do token pelo Tauri/Rust (ver `docs/SECURITY.md`).
- Anthropic (F5) ainda não existe no código.
- Login no GitHub no navegador do app, para disparar os workflows.
- Confirmação do nome do repositório remoto (`grupo-jadson-plataforma` ou `grupo-jadson-platform`). O `origin` atual é `DJJadsonReis/grupo-jadson-plataforma`.

## 6. Estado em 2026-11-12

- Repositório Git: o projeto tem `.git` e histórico (o trecho antigo dizia o contrário e foi removido). Commits locais à frente de `origin/main`: ver `ACOMPANHAMENTO_DESENVOLVIMENTO.md`, entrada de 2026-11-12. Nada foi enviado ao GitHub.
- Veja a seção 0 para o backup novo.
- Testes em 2026-11-12: backend typecheck OK, 24 suítes e 94 testes passando; desktop typecheck OK, 3 testes passando, build OK.
