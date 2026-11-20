# Relatório — Tarefa 88

## O que foi feito

- A tela Welcome obtém o token local antes da consulta a `/health`, envia `Authorization: Bearer ...` e, se receber 401, executa `ensure_desktop_setup`, relê o token e tenta novamente uma vez.
- O monitor do Workspace suprime o aviso durante o retry, executa `ensure_desktop_setup` ao receber 401, repete a checagem e só então publica o aviso se a resposta continuar 401. O polling permanece em 10 segundos.
- O teste do monitor confirma a ordem health → reparo → nova checagem → aviso. O teste da checagem de primeira execução usa `fetch` dublê para simular 401 e depois 200 com token, sem chamada externa.
- O spec backend preexistente foi preservado e ampliado: casos para arquivo ausente, token de 63 caracteres, protocolo https e aplicação da configuração no ambiente. Todos usam caminho temporário `GJ_DESKTOP_SETUP_PATH`.

## Arquivos alterados

- `apps/desktop/src/Welcome.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/api-token.ts`
- `apps/desktop/src/lib/api-token.test.ts`
- `apps/desktop/src/lib/first-run-health.ts` (novo)
- `apps/desktop/src/lib/first-run-health.test.ts` (novo)
- `apps/backend/src/modules/bootstrap/desktop-setup.spec.ts`
- `docs/_orq/codex-88-relatorio.md` (este relatório)

## Testes e verificações

| Comando | Exit code | Resultado real |
|---|---:|---|
| `corepack pnpm --filter @grupo-jadson/backend typecheck` | 0 | TypeScript passou. |
| `corepack pnpm --filter @grupo-jadson/backend test -- --runInBand` (execução final) | 0 | 12 suites puladas, 109 passaram; 23 testes pulados, 537 passaram. |
| `corepack pnpm --filter @grupo-jadson/desktop typecheck` (execução final) | 0 | TypeScript passou. |
| `corepack pnpm --filter @grupo-jadson/desktop test` (execução final) | 0 | 40 arquivos e 182 testes passaram. |
| `git diff --cached --check` antes do commit | 0 | Sem erros de whitespace. |
| Busca no diff staged por padrões de segredo (`sk-`, `tvly-`, `ntn_` e 64 hexadecimais) | 0 | Nenhuma correspondência. Tokens fictícios existentes nos testes não foram adicionados por esta tarefa. |
| `git diff HEAD^ HEAD --check` | 0 | Sem erros de whitespace no commit de implementação. |

Durante a correção, a primeira execução do typecheck do desktop terminou com exit code 1 por erros de tipagem no código novo; foram corrigidos e a execução final passou com exit code 0. A primeira execução da suíte backend retornou exit code 0, mas totalizou 533 testes aprovados; preservando os testes preexistentes do spec e adicionando os casos pedidos, a execução final totalizou 537 aprovados.

Testes relevantes: `checkFirstRunHealth > envia o token local depois de 401 e aceita o health autenticado`; `reconexão do token local > repara o setup e repete health antes de exibir o aviso após 401`; e os casos de `desktop-setup.spec.ts` para ausência, token de 63 caracteres, URL https e aplicação válida.

A primeira execução foi verificada por testes com dublês de `fetch` e `invoke`, não no executável. O teste da Welcome cobre a função pura de checagem; não monta a interface em DOM real.

## Commit

Commit de implementação: `e1217554e8f3f36a9a62bfef7844c2cee8401865` — `fix(desktop): autentica health e repara setup local`.

Autor verificado: Jadson Reis <jrdesign9@gmail.com>. Sem linha `Co-Authored-By`.

## Pendente

- Verificar a primeira execução no executável desktop, conforme a limitação acima.
- O checkout já tinha `apps/desktop/src-tauri/build.rs` modificado e muitos arquivos de orquestração não rastreados. Foram preservados fora do commit.