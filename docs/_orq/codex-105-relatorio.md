# Relat?rio da tarefa 105

## O que foi feito

- Ajustei a valida??o do manifesto para procurar `manifest.json` e os arquivos do modelo em `raiz/onnx-community/whisper-base/`.
- O pipeline continua recebendo a raiz do recurso como `localModelPath`; com isso o Transformers acrescenta `onnx-community/whisper-base` e resolve os arquivos no layout embutido. O carregamento local mant?m `allowRemoteModels = false`.
- Atualizei o script de download e `--verify` para usar o layout novo. Reorganizei os arquivos locais j? existentes sem rede; os arquivos continuam ignorados pelo Git.
- Atualizei os testes para cobrir pipeline pronto sem download, caminho de `config.json` como o pacote resolve, hash divergente com fallback dispon?vel e rejei??o do layout antigo.

Modelo: `onnx-community/whisper-base`. Arquivos verificados: `config.json`, `generation_config.json`, `preprocessor_config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/decoder_model_merged_quantized.onnx`, `onnx/encoder_model_quantized.onnx`; manifesto cont?m esses sete arquivos. Total dos arquivos do modelo: 79.664.191 bytes (75,97 MiB).

## Prova com o pacote Transformers real

Comando executado na raiz do reposit?rio:

```powershell
node --input-type=module -e "import { performance } from 'node:perf_hooks'; import { pipeline, env } from './apps/backend/node_modules/@huggingface/transformers/dist/transformers.node.mjs'; const t=performance.now(); env.localModelPath='./apps/desktop/src-tauri/resources/dictation-model'; env.allowRemoteModels=false; await pipeline('automatic-speech-recognition','onnx-community/whisper-base',{dtype:'q8'}); console.log('PIPELINE_READY_MS='+Math.round(performance.now()-t));"
```

Resultado: exit 0; `PIPELINE_READY_MS=808`. O pipeline real carregou sem rede; nenhum ?udio foi transcrito.

## Comandos e resultados reais

| Comando | Exit | Resultado |
|---|---:|---|
| `corepack pnpm --filter @grupo-jadson/backend exec jest --runInBand src/modules/dictation/transcriber.bundled.spec.ts` | 0 (execu??o final) | 1 su?te, 4 testes passaram. A primeira execu??o falhou por cria??o n?o recursiva do diret?rio; uma execu??o intermedi?ria identificou que o teste legado ainda mantinha o modelo novo. Os dois problemas foram corrigidos e a execu??o final passou. |
| `node scripts/fetch-dictation-model.mjs --verify` | 0 | Modelo e manifesto conferidos no layout novo. |
| `corepack pnpm --filter @grupo-jadson/backend exec tsc --noEmit` | 0 | Typecheck passou. |
| `corepack pnpm --filter @grupo-jadson/backend exec jest --runInBand` | 0 | 134 su?tes passaram, 16 ignoradas; 684 testes passaram, 30 ignorados. |
| `corepack pnpm --filter @grupo-jadson/desktop exec tsc --noEmit` | 0 | Typecheck passou. |
| `corepack pnpm --filter @grupo-jadson/desktop test` | 0 | 50 arquivos e 221 testes passaram. |
| `cargo test --offline --manifest-path crates/grupo-core/Cargo.toml` com `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS="-C link-arg=-Wl,--exclude-all-symbols"` | 0 | 18 testes passaram; doc-tests: 0. |
| `git check-ignore -v` para config, manifesto e ONNX | 0 | Os tr?s arquivos permanecem ignorados por `.gitignore:61`. |
| `git ls-files --error-unmatch apps/desktop/src-tauri/resources/dictation-model/.gitkeep` | 0 | `.gitkeep` rastreado. |
| `git diff --check` | 0 | Sem erros de whitespace. |

## Arquivos alterados e commit

- `apps/backend/src/modules/dictation/transcriber.ts`
- `apps/backend/src/modules/dictation/transcriber.bundled.spec.ts`
- `scripts/fetch-dictation-model.mjs`
- `docs/_orq/codex-105-relatorio.md`

Commit: `(preenchido após commit)` ? `fix(dictation): modelo embutido no layout que o transformers usa, com teste de caminho`.

## Pendente

- Gerar o instalador e verificar o recurso dentro do execut?vel: n?o executado, pois `makensis` n?o est? dispon?vel neste ambiente; essa verifica??o depende do dono.
- N?o foi feito push.
