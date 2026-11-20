# Relatório da tarefa 111

## O que foi feito

- Adicionado o comando Tauri `stop_local_services`, executado fora da thread assíncrona e apontado para `scripts/stop.ps1` na raiz do projeto. O comando captura stdout/stderr e devolve detalhes de falhas.
- A tela de status agora oferece confirmação acessível antes do encerramento, informa que só atinge serviços registrados pelo aplicativo e que os dados serão preservados, apresenta estado de encerramento, resultado e refaz a consulta de `/health`.
- Criado `shutdown-plan.ts` com texto, regra de habilitação e interpretação de resultado, coberto por testes puros.
- `scripts/stop.ps1` inicializa a lista vazia e trata a ausência do arquivo de processos com mensagem clara e saída bem-sucedida. A sequência já existente (processos do app antes do PostgreSQL) foi mantida.
- O item 14 de `docs/FALTA_OPENBOT.md` foi marcado como Feito.

## Arquivos alterados

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/components/status/StatusPanel.tsx`
- `apps/desktop/src/lib/shutdown-plan.ts` (novo)
- `apps/desktop/src/lib/shutdown-plan.test.ts` (novo)
- `scripts/stop.ps1`
- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-111-relatorio.md` (este arquivo)

## Comandos e resultados observados

| Comando | Resultado real |
|---|---|
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/desktop test` | exit 0; 59 arquivos e 242 testes aprovados |
| `corepack pnpm --filter @grupo-jadson/backend test -- health` | exit 0; 2 suítes e 2 testes aprovados |
| `cargo check` (em `apps/desktop/src-tauri`) | exit 0 |
| `git diff --check` | exit 0; somente avisos LF/CRLF |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop.ps1` sem `.runtime/processes.json` (stdout capturado em bytes e decodificado por UTF-8) | exit 0; a mensagem de ausência e a conclusão foram emitidas. Pontos de código confirmaram `ç` (U+00E7) e `í` (U+00ED). O script constrói esses caracteres por pontos de código porque Windows PowerShell 5 lê `.ps1` UTF-8 sem BOM como ANSI. |
| Verificação de `scripts/stop.ps1` para remoção dos dados | não há `Remove-Item` apontado a `.runtime/database` nem à pasta de dados; a única remoção é o arquivo `.runtime/processes.json`. |

Não executei o encerramento com processos reais registrados para evitar parar serviços desta máquina. O componente não tem teste Testing Library no projeto; o cancelamento foi revisado no componente e a lógica pura tem testes unitários. Não houve instalação de dependências nem uso/leitura de `.env`.

## Commits

- Código: `199164040a45ace039b1b8aa6d9c45028afcdb88` — `feat(desktop): parar serviços locais pela tela de status, com confirmação (tarefa 111)`.
- Documentação: `docs(desktop): registrar relatório da tarefa 111`.
- O comando `git log -1 --format="%H%n%an%n%ae%n%b"` confirmou o commit de código acima com autor Jadson Reis <jrdesign9@gmail.com> e corpo sem trailer `Co-Authored-By`. A autoria do commit de documentação foi conferida depois de criá-lo.

## Pendente

- Validar o encerramento real com serviços registrados em um ambiente descartável.
