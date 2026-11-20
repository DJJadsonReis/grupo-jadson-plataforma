# Relatório da tarefa 95

## O que foi feito

- A resolução de token MCP agora atualiza `last_used_at` apenas quando encontra o dono ativo, e retorna também nome e papel reais. A associação entre `owner_id` textual e `users.id` usa `u.id::text=t.owner_id`.
- Controller e ferramentas propagam o `Principal` autenticado completo nas operações de agentes, removendo o papel MCP fixo.
- Specs cobrem usuário desativado (401), reativação com o mesmo token, papéis admin/viewer nas verificações de permissões e preservação do fluxo de auditoria/isolamento.

## Arquivos alterados

- `apps/backend/src/modules/mcp-server/mcp-server-tokens.service.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tokens.service.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.controller.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.controller.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tools.ts`
- `apps/backend/src/modules/mcp-server/mcp-server-tools.spec.ts`
- `apps/backend/src/modules/mcp-server/mcp-server.e2e.spec.ts`
- `docs/_orq/codex-95-relatorio.md` (este relatório)

## Comandos e resultados

- `corepack pnpm --filter @grupo-jadson/backend typecheck` — exit code 0.
- `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` — exit code 0; 127 suítes passaram, 13 foram puladas; 639 testes passaram, 24 foram pulados.
- `rg -n 'role: "operator"' apps/backend/src/modules/mcp-server` — exit code 1 (nenhuma ocorrência).
- `git diff --check` — exit code 0. (Executado antes do commit; `git diff HEAD^ HEAD --check` também concluiu sem erros.)
- Verificação de padrões de segredo nos acréscimos do diff restrito aos arquivos da tarefa — exit code 0; nenhum padrão suspeito encontrado (literais fictícios de teste permitidos).

## Commit

`691bd9a60ba876d8c128a05c94c3063c155fc503` — `fix: token MCP respeita pessoa desativada e papel real`; autor `Jadson Reis <jrdesign9@gmail.com>`, sem Co-Authored-By.

## Pendente

- Os testes PostgreSQL condicionais permanecem pulados quando `TEST_DATABASE_URL` não está configurada; não foram contados como aprovados.