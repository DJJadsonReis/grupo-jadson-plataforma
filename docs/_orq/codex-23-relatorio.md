COMMIT — commit local c391bb0 criado; implementação e verificações aprovadas.

# Relatório da tarefa 23

## O que foi feito

- Adicionada a coluna `skills.global` por migração aditiva e registrada na inicialização do banco.
- Administradores podem criar habilidades globais; leitores e operadores recebem `FORBIDDEN` ao tentar fazê-lo. Valores não booleanos recebem `INVALID_SKILL`.
- A listagem inclui habilidades próprias e globais. Exclusão permite ao dono apagar as próprias habilidades e ao admin apagar habilidades globais; os demais recebem `SKILL_NOT_FOUND`.
- Bots podem anexar, listar e desanexar habilidades globais, mantendo o limite de cinco. `loadPromptSkills` continua carregando habilidades anexadas; cobertura confirma que uma habilidade global chega ao texto do prompt.
- Expectativas existentes de assinaturas e condições SQL foram atualizadas; nenhum teste existente foi removido. Os casos específicos estão no critério 9.

## Arquivos alterados

- `apps/backend/src/modules/database/migrations/026-skills-globais.ts` — nova migração `026-skills-globais`.
- `apps/backend/src/modules/database/migrations/026-skills-globais.spec.ts` — teste de SQL aditivo sem `DROP`.
- `apps/backend/src/modules/database/database.service.ts` — registro da migração 026.
- `apps/backend/src/modules/skills/skills.service.ts` — `list(principal: Principal)`, `create(principal: Principal, input: SkillInput)`, `remove(principal: Principal, slug: string)`.
- `apps/backend/src/modules/skills/skills.controller.ts` — encaminha o principal inteiro.
- `apps/backend/src/modules/skills/agent-skills.service.ts` — permite globais nas operações de associação e inclui `global` nos registros.
- `apps/backend/src/modules/skills/skills.service.spec.ts` — cobertura de permissão, listagem, exclusão e criação global.
- `apps/backend/src/modules/skills/skills.controller.spec.ts` — expectativas da assinatura atualizadas.
- `apps/backend/src/modules/skills/agent-skills.service.spec.ts` — cobertura de associação/listagem global e limite existente mantido.
- `apps/backend/src/modules/skills/skill-prompt.spec.ts` — confirma habilidade global anexada no prompt.

## Linha de base e resultado final

Base medida antes de editar, em `7a91e41`:

- Typecheck: exit 0 (`tsc --noEmit`).
- Testes: exit 0; `Test Suites: 7 skipped, 52 passed, 52 of 59 total`; `Tests: 15 skipped, 243 passed, 258 total`.

Após as alterações:

- Typecheck: exit 0.
- Testes: exit 0; `Test Suites: 7 skipped, 53 passed, 53 of 60 total`; `Tests: 15 skipped, 249 passed, 264 total`.
- Diferença: +1 suite aprovada e +6 testes aprovados; skips inalterados.

## Comandos executados e resultados reais

| Comando | Resultado |
| --- | --- |
| `node tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --filter @grupo-jadson/backend typecheck` (baseline) | exit 0; linha final `tsc --noEmit` concluída sem erro. |
| `node tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --filter @grupo-jadson/backend test` (baseline) | exit 0; 52 suites e 243 testes passaram; 7 suites e 15 testes skipped. |
| `node tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --filter @grupo-jadson/backend typecheck` (final) | exit 0; `tsc --noEmit` concluído sem erro. |
| `node tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --filter @grupo-jadson/backend test` (final) | exit 0; `Test Suites: 7 skipped, 53 passed, 53 of 60 total`; `Tests: 15 skipped, 249 passed, 264 total`. |
| `git diff --check` | exit 0. |
| `git diff --exit-code -- apps/backend/src/modules/tools apps/backend/src/modules/chat apps/backend/package.json pnpm-lock.yaml apps/desktop/src` | exit 0. |
| `git diff --exit-code -- apps/backend/src/modules/tools apps/backend/src/modules/chat apps/backend/package.json pnpm-lock.yaml apps/desktop` | exit 1; detectou somente a alteração preexistente em `apps/desktop/src-tauri/build.rs`, não feita nem staged nesta tarefa. |

## Critérios de aceite

1. **Atendido por teste:** migração verifica `ADD COLUMN IF NOT EXISTS global` e ausência de `DROP`.
2. **Atendido por teste:** admin cria global e recebe `global: true`.
3. **Atendido por teste:** não-admin recebe 403 `FORBIDDEN` ao tentar criação global.
4. **Atendido por teste e leitura SQL:** listagem verifica `owner_id=$1 OR global`; o filtro não inclui habilidades pessoais alheias.
5. **Atendido por teste:** remoção não-admin falha como `SKILL_NOT_FOUND`; admin pode remover global.
6. **Atendido por teste:** dono associa global de outro dono, lista a associação e verifica que chega ao prompt via `loadPromptSkills`.
7. **Atendido por teste:** skill pessoal alheia continua inelegível e retorna 404 `SKILL_NOT_FOUND`.
8. **Atendido por teste existente:** limite de cinco continua bloqueando associação antes do insert, inclusive sem distinção por global.
9. **Atendido por leitura do diff de `c391bb0`:** expectativas existentes alteradas, com arquivo e motivo:
   - `apps/backend/src/modules/skills/skills.service.spec.ts`: o teste `lists only rows for the supplied owner` passou a `lists owned and global rows for the supplied principal`; a expectativa SQL `WHERE owner_id=$1` passou a `WHERE owner_id=$1 OR global`. Motivo: listagem agora inclui habilidades globais.
   - Mesmo arquivo: a expectativa de remoção `WHERE owner_id=$1 AND slug=$2` passou a `WHERE slug=$1 AND (owner_id=$2 OR (global AND $3))`, com parâmetros esperados `["research", "person-1", false]`. Motivo: nova regra de remoção pessoal/admin global.
   - `apps/backend/src/modules/skills/agent-skills.service.spec.ts`: a expectativa SQL `s.owner_id=$2` do teste de desanexação passou a `s.owner_id=$2 OR s.global`. Motivo: a nova condição do vínculo permite skills globais.
   - `apps/backend/src/modules/skills/skills.controller.spec.ts`: as expectativas de chamadas de `list`, `create` e `remove` trocaram o id textual `"person-1"` pelo objeto `principal`. Motivo: nova assinatura recebe o principal inteiro.
   - `apps/backend/src/modules/skills/skills.service.spec.ts`: chamadas existentes de `create`, `list` e `remove` passaram a receber `operator`/principal; o caso de criação de outro dono passa um principal com id `person-2`. Motivo: nova assinatura recebe principal para autorização.
   - Mesmo arquivo: expectativa dos parâmetros de criação pessoal passou a incluir `false` para o novo argumento `global`. Motivo: persistir explicitamente que a habilidade não é global.
   - Nenhuma asserção existente foi removida. Houve substituição dos textos esperados acima; novas asserções para novos comportamentos foram acrescentadas.
10. **Atendido por execução registrada:** typecheck e testes finais passaram; contagens registradas acima.

## Commit

- Hash: c391bb0
- Mensagem: `feat(backend): habilidades globais gerenciadas por admin e usáveis em qualquer bot`
- Autoria: Jadson Reis <noreply@anthropic.com> (Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>).
- O relatório e demais arquivos em `docs/_orq/` ficaram fora do commit `c391bb0` da tarefa 23.
- `apps/desktop/src-tauri/build.rs` estava modificado antes desta tarefa e foi excluído do stage e do commit.

## Pendências e observações

- Correção futura: se o mesmo admin tiver uma skill global e uma pessoal com o mesmo slug, `AgentSkillsService.attach` e `detach` usam `WHERE ... s.slug=$3` sem preferência. `attach` usa `rows[0]` de uma consulta que pode retornar ambas em ordem não definida; pode anexar a global quando a pessoa queria a própria skill.
- Descrições e instruções de skills continuam sem envelope de conteúdo não confiável; avaliar na fatia correspondente, conforme observação do revisor.
- A autoria do commit `c391bb0` é Jadson Reis <noreply@anthropic.com>, mesma observação das tarefas 21 e 22.
- O comando amplo de escopo retornou 1 unicamente por `build.rs` preexistente; a checagem repetida sem `apps/desktop/src-tauri/build.rs` retornou 0.

## Verificação desta correção

- O `grep` solicitado não está instalado neste ambiente (PowerShell: comando não reconhecido). Checagem equivalente feita lendo o arquivo como UTF-8 e contando as três sequências com .NET Regex.
- Resultado: `codificacao-check count: 0`; exit code 0.