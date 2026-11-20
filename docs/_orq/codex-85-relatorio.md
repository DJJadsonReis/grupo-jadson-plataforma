# Relatório Codex — tarefa 85

## O que foi feito

- Implementada no backend a matriz dos cinco modos, a checagem de precedência de políticas e a revalidação de `deny` e do modo atual antes de executar uma aprovação pendente.
- Adicionadas persistência e migração 042 para o modo por conversa e o padrão por agente. Conversas novas usam a escolha inicial validada ou herdam o padrão do agente; a troca de modo da conversa não atualiza o agente.
- Adicionadas rotas para ler e gravar o modo. `Ignorar permissões` exige papel `admin` do principal autenticado, frase de confirmação no servidor e no modal do desktop, e registra a ativação. Execuções registram o modo na auditoria.
- Adicionado seletor no composer, atalhos Alt+1–4 na caixa de mensagem, confirmação própria para o modo administrativo e seletor de padrão no editor do agente.
- Documentação da matriz, precedência, interface e classificação das ferramentas criada em `docs/MODOS_DE_OPERACAO.md`; a linha correspondente em `docs/FALTA_OPENBOT.md` foi marcada Feito.

## Classificação explícita das ferramentas registradas

| Categoria | Ferramentas |
|---|---|
| Leitura | `tempo.agora`, `memoria.listar`, `agenda.listar_eventos`, `drive.listar_arquivos`, `computador.listar`, `computador.ler`, `notion.ler_pagina` |
| Escrita de arquivo | `computador.escrever` |
| Escrita de documento | `drive.criar_arquivo`, `notion.criar_pagina`, `notion.anexar_texto` |
| Escrita de memória | Nenhuma ferramenta de escrita de memória separada; `memoria.apagar_tudo` é classificada como sensível |
| Rede | `busca.wikipedia`, `pagina.ler`, `busca.web`, `notion.buscar` |
| Código | Nenhuma ferramenta direta de execução de código; `subagente.delegar` fica em sensível por delegar execução fora do ciclo síncrono |
| Envio | `agenda.criar_evento` |
| Sensível | `subagente.delegar`, `memoria.apagar_tudo`, `atendimento.humano` e ferramentas MCP sem categoria confiável |

Não houve ferramenta sem categoria; ferramentas MCP recebem a classificação mais restritiva (`sensivel`).

## Arquivos da tarefa

- Backend: `agents.controller.ts`, `agents.service.ts`, `agents.service.spec.ts`, `auth.controller.ts`, `chat.controller.ts`, `chat.controller.spec.ts`, `chat.module.ts`, `conversations.controller.ts`, `conversations.controller.spec.ts`, `conversations.service.ts`, `database.service.ts`, `tools.approval.spec.ts`, `tools.registry.ts`, `tools.service.ts`, `tool-search.ts`, `tool-search.spec.ts`, `tools.secret-masking.spec.ts`, migração 042 e seu teste, `operation-modes.ts` e seu teste.
- Desktop: `App.tsx`, `workspace.ts`, `operation-modes.ts` e `operation-modes.test.ts`.
- Documentação: `docs/MODOS_DE_OPERACAO.md`, atualização da linha em `docs/FALTA_OPENBOT.md`, este relatório.

Arquivos existentes do histórico local (`build.rs`, `Cargo.lock`, `docs/_orq` fora deste relatório e demais mudanças alheias) foram deixados fora do stage/commit.

## Verificações executadas

| Comando | Exit code | Resultado real |
|---|---:|---|
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | 0 | `tsc --noEmit` sem erros |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | 0 | 108 suítes passaram; 12 foram puladas; 529 testes passaram e 23 foram pulados (552 total) |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | 0 | `tsc --noEmit` sem erros |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 39 arquivos passaram; 179 testes passaram |
| `git diff --check` | 0 | Sem erros de whitespace |
| Busca exigida em linhas adicionadas por padrões de segredo | 0 | Sem correspondências |
| Testes focados antes da rodada completa: `tools.approval`, `tools.drive`, `notion.e2e`, `tools.human-support`, `chat.controller` | 0 | 5 suítes; 47 testes passaram |

Não havia `TEST_DATABASE_URL`; portanto as suítes que dependem de PostgreSQL foram puladas pela configuração (`12` suítes / `23` testes no total do Jest). A migração tem teste de contrato, mas persistência em Postgres e reinício do backend não foram executados neste PC.

## Cobertura e pendências

- `operation-modes.spec.ts` cobre as 20 combinações (5 modos × 4 categorias pedidas), além dos casos de `deny`, `allow` em Automático/Planejamento e `ask` em Ignorar permissões. `tools.approval.spec.ts` cobre bloqueio de escrita em Planejamento, execução auditada em Ignorar permissões e revalidação de `deny` pendente; `chat.controller.spec.ts` cobre o modo submetido na primeira mensagem.
- A autorização admin/usuário é verificada pela rota e serviço; teste PostgreSQL da persistência e auditoria depende de `TEST_DATABASE_URL` e não rodou.
- O projeto não tem harness React/DOM para teste de componente. Assim, não foi possível cumprir literalmente o teste de componente do seletor/modal: foram testados helpers de visibilidade/atalhos e o cliente API, e o typecheck/build do desktop passou. Clique, cancelamento e renderização do modal não foram automatizados.
- A aprovação do plano acontece de forma explícita quando a pessoa sai de Planejamento e escolhe um dos modos de execução no seletor; não existe tela separada de aprovação/resumo do plano.
- Nenhum `.env` foi aberto ou alterado; nenhuma chamada a provedor externo foi feita. Não houve push.

## Commit

Hash: `84c17ece5799f00450f90a996af6cead1dbd178e`\n\nMensagem: `feat: adiciona modos de operação por conversa`.\n\nAutor verificado por `git log -1 --format='%H %an <%ae>%n%B'`: Jadson Reis <jrdesign9@gmail.com>. Sem linha `Co-Authored-By`.
