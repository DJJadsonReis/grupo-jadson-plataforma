# Relatório da tarefa 87

## O que foi feito

- O Tauri valida e repara `setup.json`: gera token criptográfico de 256 bits quando ausente ou inválido, mantém URL PostgreSQL válida, usa `DATABASE_URL` do ambiente como alternativa, preserva os demais campos e grava com arquivo temporário e troca atômica. A configuração válida não é regravada sem necessidade.
- O app garante o reparo na abertura e ao Reconectar. Ele repete chamadas recusadas e monitora `/api/v1/health` a cada 10 segundos.
- O backend relê `setup.json` antes de autenticar cada rota protegida, então uma configuração reparada passa a valer sem reiniciar o processo. O health agora exige token.
- `scripts/restart-backend.ps1` reinicia o processo registrado ou quem ocupa a porta, usa os valores do setup sem exibi-los, grava em `.runtime\logs` e aceita `-DryRun`. O runner ativo de rebuild foi apontado para esse script.
- Escolha do item 2: o backend relê o setup no guard a cada requisição protegida; isso permite recuperar um processo ativo sem reiniciá-lo. O script oficial também inicia o backend com o token e a URL do setup.

## Arquivos alterados

- `apps/backend/src/modules/auth/api-token.guard.ts`
- `apps/backend/src/modules/auth/api-token.guard.spec.ts`
- `apps/backend/src/modules/bootstrap/desktop-setup.ts`
- `apps/backend/src/modules/health/health.controller.ts`
- `apps/backend/src/modules/health/health.setup.e2e.spec.ts`
- `apps/desktop/src-tauri/crates/grupo-core/src/setup_config.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/api-token.ts`
- `apps/desktop/src/lib/api-token.test.ts`
- `scripts/restart-backend.ps1`
- `docs/_orq/rebuild-teste-runner.ps1`
- `docs/_orq/codex-87-relatorio.md`

## Comandos e resultados

| Comando | Resultado real |
| --- | --- |
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` | exit 0; 109 suítes passaram, 12 puladas; 535 testes passaram, 23 pulados |
| `corepack pnpm --filter @grupo-jadson/backend build` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/desktop test` | exit 0; 39 arquivos e 180 testes passaram |
| `cargo test --offline` em `apps/desktop/src-tauri/crates/grupo-core` | exit 0; 14 testes passaram |
| `cargo check --offline --lib` em `apps/desktop/src-tauri` | exit 0 |
| Parser PowerShell de `scripts/restart-backend.ps1` | exit 0; sem erros de sintaxe |
| `scripts/restart-backend.ps1 -DryRun` com setup sintético em caminho temporário | exit 0; saída sem token ou URL |
| Reinício isolado do script com porta, setup, registro de processo e logs temporários | exit 0; health autenticado 200, sem token 401; processo encerrado ao fim |
| `git diff --cached --check` | exit 0 |
| Varredura de segredos definida no critério de aceite | exit 0; nenhuma correspondência |

Uma primeira execução de integração usou o `dist` antigo e não passou no critério de autenticação; após `backend build` (exit 0), a repetição isolada passou. Na tentativa inicial, a verificação de conexão PostgreSQL falhou na autenticação antes de executar consulta. Nenhum dado foi alterado. A repetição final usou uma porta local indisponível para o PostgreSQL.

## Commit

- Commit da implementação: `63a371f0ea23eaf3d11d0165ea63ccd29ec9fd86` — `fix: sincroniza token e repara setup local`
- Autor verificado por `git log`: `Jadson Reis <jrdesign9@gmail.com>`; sem `Co-Authored-By`.

## Pendências

- Não foi feito build do executável Tauri nem teste manual no computador do dono; os testes Tauri cobriram a crate pura e a integração HTTP real foi isolada com setup temporário.
- A tarefa 34.2 (validação do ditado no executável) permanece fora do escopo desta tarefa.
