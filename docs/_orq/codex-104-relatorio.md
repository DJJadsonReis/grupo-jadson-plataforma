# Relatório da tarefa 104

Data: 20/11/2026

## O que foi feito

- O Tauri empacota os recursos do modelo no caminho `dictation-model/`; em desenvolvimento, o backend recebe o caminho dos recursos pelo ambiente nos dois fluxos locais de inicialização/reinício.
- O backend confere tamanho e SHA-256 dos arquivos do manifesto e inicia o pipeline em segundo plano sem acesso remoto. Um manifesto inválido mantém o download como fallback; falha ao carregar também reabilita o download remoto.
- O desktop espera a verificação/carregamento do modelo embutido. Quando o modelo fica pronto, inicia a captura sem pedir download; quando a verificação termina e o modelo falta, mantém a confirmação/download existente.
- Foi criado o script Node de download idempotente e verificação local. Os arquivos do modelo ficam ignorados pelo Git, com `.gitkeep` versionado.
- Testes usam arquivos temporários falsos; não acessam rede nem carregam o modelo real.

## Arquivos alterados

- `.gitignore`
- `apps/backend/src/modules/dictation/dictation.service.ts`
- `apps/backend/src/modules/dictation/transcriber.ts`
- `apps/backend/src/modules/dictation/transcriber.bundled.spec.ts` (novo)
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/resources/dictation-model/.gitkeep` (novo)
- `apps/desktop/src/lib/dictation-session.ts`
- `apps/desktop/src/lib/dictation-session.test.ts`
- `scripts/fetch-dictation-model.mjs` (novo)
- `docs/_orq/codex-104-relatorio.md` (este relatório)

## Modelo e licença

Página do modelo: [onnx-community/whisper-base no Hugging Face](https://huggingface.co/onnx-community/whisper-base). Licença indicada na página: Apache-2.0.

Lista efetivamente usada por `automatic-speech-recognition`, `dtype: q8`, conforme a árvore do repositório e o Transformers.js 4.3.2 instalado:

| Arquivo | Bytes |
| --- | ---: |
| `config.json` | 2.243 |
| `generation_config.json` | 3.832 |
| `preprocessor_config.json` | 339 |
| `tokenizer.json` | 2.480.466 |
| `tokenizer_config.json` | 282.682 |
| `onnx/decoder_model_merged_quantized.onnx` | 53.693.315 |
| `onnx/encoder_model_quantized.onnx` | 23.201.314 |
| **Total** | **79.664.191 bytes (75,97 MiB)** |

`node scripts/fetch-dictation-model.mjs --verify` conferiu o manifesto e os SHA-256 localmente. `git check-ignore` confirmou que os dois ONNX e `manifest.json` são ignorados; `.gitkeep` não é ignorado e foi versionado. Nenhum peso ou manifesto gerado entrou no commit.

## Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `node scripts/fetch-dictation-model.mjs` | exit 0; baixou os sete arquivos e criou o manifesto |
| `node scripts/fetch-dictation-model.mjs --verify` | exit 0 |
| `git check-ignore -v` para os dois ONNX e `manifest.json` | exit 0; os três caminhos foram ignorados |
| `git check-ignore apps/desktop/src-tauri/resources/dictation-model/.gitkeep` | exit 1; esperado, pois `.gitkeep` não está ignorado |
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/desktop test` | exit 0; 50 arquivos, 221 testes passaram |
| `corepack pnpm --filter @grupo-jadson/backend exec tsc --noEmit` | exit 0 |
| `corepack pnpm --filter @grupo-jadson/backend exec jest --runInBand` | exit 0; 134 suítes passaram, 16 ignoradas; 683 testes passaram, 30 ignorados |
| Testes focados `transcriber.bundled.spec.ts` e `dictation.controller.spec.ts` | exit 0; 2 suítes passaram, 16 testes passaram, 1 ignorado |
| Testes desktop focados `dictation-session.test.ts` e `dictation-api.test.ts` | exit 0; 2 arquivos, 13 testes passaram |
| `cargo test --offline --manifest-path crates/grupo-core/Cargo.toml` com `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS="-C link-arg=-Wl,--exclude-all-symbols"` | exit 0; 18 testes passaram |
| `cargo test --offline --lib --no-run` com o mesmo contorno MinGW | exit 0; biblioteca do app compilada |
| Build release Tauri `--no-bundle`, com `beforeBuildCommand` substituído por `corepack pnpm --filter @grupo-jadson/desktop build` | exit 0; frontend e executável compilados. O linker emitiu aviso preexistente de manifests Windows duplicados |
| `git diff --check` | exit 0 |
| `git diff --cached --check` antes do commit | exit 0 |
| Tentativa inicial `tauri build --no-bundle` sem override | exit 1; `beforeBuildCommand` tentou chamar `pnpm`, que não está disponível diretamente no PATH. A execução com `corepack pnpm` passou |

O executável de validação sem bundle ficou com 28.891.357 bytes (28,51 MiB); ele não contém o modelo, então não é uma comparação do instalador final.

## Commit

- Implementação: `d02ba89c3d3d8ac8e7c3139d9e5385a860dee213` — `feat: embutir modelo local de ditado no desktop`
- Autor conferido por `git log`: Jadson Reis `<jrdesign9@gmail.com>`
- `git cat-file -t d02ba89`: `commit`
- Não há trailer `Co-Authored-By`.

## Pendente

- O instalador MSI/NSIS não foi gerado: `makensis` não está instalado. Portanto, os tamanhos antes/depois do instalador não puderam ser medidos. A pasta real do modelo local tem 75,97 MiB.
- Pendente (ação do dono): instalar o exe gerado no PC de uso e confirmar `GET /dictation/status` como `ready`, captura/transcrição local sem pedido de download, e fallback após remover/corromper os recursos. Nenhum áudio foi enviado em testes.
- O tempo real de carga do pipeline não foi medido com o modelo real. Estimativa não medida: de alguns segundos a dezenas de segundos na primeira inicialização, dependendo do CPU e da inicialização das sessões ONNX.
- A tentativa sem override do build Tauri não funciona neste ambiente porque o comando configurado chama `pnpm` diretamente; a compilação com o override `corepack pnpm` concluiu com exit 0.

As alterações preexistentes em `apps/desktop/src-tauri/build.rs` e demais arquivos locais não foram incluídas nem modificadas por esta tarefa; `build.rs` permanece fora do stage.