# Relatório Codex — tarefa 112

## O que foi feito

- O serviço de salas grava `team.room.created`, `team.room.member_added` e `team.room.member_removed` depois dos writes bem-sucedidos, usando `principal.id` como ator e somente os metadados especificados.
- Uma inclusão idempotente de membro já existente não cria evento; falhas de autorização e remoção de membro inexistente também não criam evento.
- `send` continua sem registrar mensagens na auditoria. Não há operação para adicionar/remover bots: `team-rooms.controller.ts` expõe rotas para pessoas e mensagens (linhas 15–21), e no serviço os bots só são selecionados por menção durante `send` (linhas 104–114).
- A seção Atividades usa rótulos pt-BR para os três eventos novos. O filtro de ação já era texto livre e a tela já não consulta a auditoria para quem não é administrador.
- A busca da auditoria foi exercitada com filtro `team.room.member_added` pelo `AuditController`, verificando ator, subject, detalhes e ausência de conteúdo de mensagem.
- Atualizei o item 13 de `docs/FALTA_OPENBOT.md` com as evidências da tarefa.
- Verificação de conteúdo: busca `rg -n 'details:.*(content|token|secret|key)' apps/backend/src/modules/team-rooms/team-rooms.service.ts` não encontrou correspondências (exit code 0 no comando de verificação).

## Arquivos alterados

- `apps/backend/src/modules/team-rooms/team-rooms.service.ts`
- `apps/backend/src/modules/team-rooms/team-rooms.service.spec.ts`
- `apps/backend/src/modules/team-rooms/team-rooms.e2e.spec.ts`
- `apps/backend/src/modules/team-rooms/team-rooms.module.ts`
- `apps/backend/src/modules/team-rooms/team-rooms.pg.spec.ts` (injeção de auditoria no fixture PostgreSQL)
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/audit-labels.ts` (novo)
- `apps/desktop/src/lib/audit-labels.test.ts` (novo)
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-112-relatorio.md` (este relatório)

## Commits locais

- Código: `80f529ccfae964d09272feecef8e37e4595bd8b7` — `feat(audit): registra criação de sala e mudanças de membros na auditoria da equipe (tarefa 112)`.
- Documentação: será registrado em commit próprio após este relatório.
- Conferência do commit de código: autor `Jadson Reis <jrdesign9@gmail.com>`; corpo sem trailer `Co-Authored-By`.

## Comandos rodados e resultados

| Comando | Exit code | Resultado |
| --- | ---: | --- |
| `corepack pnpm --filter @grupo-jadson/backend exec tsc --noEmit` | 1, depois 0 | A primeira execução apontou inferência implícita no mock e2e; após o ajuste, passou. |
| `corepack pnpm --filter @grupo-jadson/backend test -- team-rooms` | 1, 1, depois 0 | Duas primeiras execuções falharam por expectativa do UUID gerado e tipagem do mock; após correção, 4 suites passaram, 12 testes passaram e 1 teste PostgreSQL foi ignorado. Repetido após o último ajuste: mesmo resultado, exit 0. |
| `corepack pnpm --filter @grupo-jadson/backend test -- audit` | 0 | 6 suites passaram, 32 testes passaram; 2 suites e 6 testes foram ignorados. |
| `corepack pnpm --filter @grupo-jadson/backend test` | 0 | 136 suites passaram, 698 testes passaram; 17 suites e 31 testes foram ignorados. Executado duas vezes, com o mesmo resultado. |
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | 1, depois 0 | A primeira execução não reconheceu globais do Vitest no teste novo; após importar os helpers do Vitest, passou. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 60 arquivos de teste e 244 testes passaram. |
| `git diff --check` | 0 | Passou; Git mostrou somente avisos de conversão LF/CRLF, que não são erros. |
| Busca por campos sensíveis nos `details` do serviço | 0 | Nenhuma correspondência encontrada. |

O teste PostgreSQL de integração foi ignorado porque `TEST_DATABASE_URL` não estava definido no processo. Nenhuma URL ou credencial foi lida ou impressa.

## Pendente

- Executar o teste PostgreSQL de integração em ambiente de teste configurado (`TEST_DATABASE_URL`).
- A auditoria de bots não se aplica ao código atual: não existe endpoint/operação para adicionar ou remover bot como membro da sala.
