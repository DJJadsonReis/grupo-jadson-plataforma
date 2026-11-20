# Relatório: correção de boot do backend

## Causa

`ResponsibilitiesService` injeta `AgentPolicyService`, provido por `ToolsModule`. O `ToolsModule` exportava somente `ToolsService`, deixando `AgentPolicyService` indisponível no contexto de `ResponsibilitiesModule`.

## Arquivos alterados

- `apps/backend/src/modules/tools/tools.module.ts` — exporta também `AgentPolicyService`.
- `apps/backend/src/app.module.spec.ts` — compila o grafo completo com `Test.createTestingModule({ imports: [AppModule] })`.
- `docs/_orq/fix-boot-relatorio.md` — este relatório.

## Verificações

- `corepack pnpm build` em `apps/backend`: passou.
- `corepack pnpm typecheck` em `apps/backend`: passou.
- `corepack pnpm test -- --runInBand` em `apps/backend`: passou; 88 suítes passaram, 11 foram ignoradas (401 testes passaram, 21 foram ignorados).
- Backend iniciado com `node dist/main.js`, cwd `apps/backend`, oculto; logs em `.runtime/logs/backend.out.log` e `.runtime/logs/backend.err.log`.
- `GET http://127.0.0.1:3333/api/v1/health`: HTTP 200.
- PID observado: 24268.

## Commit

`98cadc149ddd88b5cbd8cbb82cb12e09f1dcad0d` — `Corrige injeção de política no boot do backend`.

