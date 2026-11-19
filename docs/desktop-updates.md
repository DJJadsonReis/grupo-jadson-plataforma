# Atualizações do desktop

O desktop usa o plugin oficial `tauri-plugin-updater` e o pacote JavaScript `@tauri-apps/plugin-updater`, ambos fixados em `2.14.1` (publicados em 2026-10-28, licença `MIT OR Apache-2.0`). O plugin verifica a atualização assinada ao abrir Configurações → Atualizações e permite instalar a versão encontrada.

## Configuração

`apps/desktop/src-tauri/tauri.conf.json` contém a chave pública do signer e um endpoint de exemplo em `https://updates.example.invalid/{{target}}/{{arch}}/{{current_version}}`. O domínio `.invalid` é reservado e não hospeda serviço. Substitua o endpoint por um manifesto HTTPS que você controle quando houver hospedagem; nenhum serviço externo é criado por esta configuração.

O app gera artefatos assinados para MSI/NSIS. A chave privada local fica fora do repositório em `%LOCALAPPDATA%\GrupoJadson\updater\signing.key`; somente a chave pública vai para `tauri.conf.json`. Não copie a chave privada para Git, artefatos ou logs. Antes de empacotar uma versão de atualização, disponibilize-a ao processo de build sem colocá-la em arquivos versionados:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:LOCALAPPDATA 'GrupoJadson\updater\signing.key'
node tools/pnpm/node_modules/pnpm/bin/pnpm.cjs --filter @grupo-jadson/desktop exec tauri build
```

O manifesto servido pelo endpoint deve seguir o formato do updater do Tauri e conter versão SemVer, URL HTTPS do instalador de atualização e assinatura gerada no build. A verificação e a instalação não foram testadas contra um serviço hospedado; o endpoint de exemplo não deve ser usado para publicar.

## Gerar manifesto estático

Depois de gerar os artefatos de atualização assinados com `tauri build`, use o instalador NSIS e o `.sig` adjacente para montar `latest.json`. O script lê somente os dois caminhos informados, não acessa chaves e não publica arquivos:

```powershell
node apps/desktop/scripts/gerar-manifesto-atualizacao.mjs `
  --version 1.2.3 `
  --base-url https://seu-host.example/desktop `
  --artifact "apps/desktop/src-tauri/target/release/bundle/nsis/Grupo Jadson_1.2.3_x64-setup.exe" `
  --notes "Correções e melhorias" `
  --out latest.json
```

`--out` é opcional; sem ele, o JSON vai para stdout. Para cada instalador informado, o script espera a assinatura em `<caminho-do-instalador>.sig`. A URL combina a base informada com o nome do instalador codificado para URL. A chave estática usada é `windows-x86_64`.

Escolhemos NSIS como artefato deste comando porque a configuração atual do app usa `windows.installMode: passive`, que o plugin Tauri updater 2.14.1 converte no argumento `/P` para NSIS (`tools/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-plugin-updater-2.14.1/src/config.rs`, `WindowsUpdateInstallMode::nsis_args`). O código do plugin também reconhece MSI e NSIS (`src/updater.rs`); este fluxo documenta apenas NSIS.

Ainda falta escolher e configurar a hospedagem pública HTTPS para o `latest.json` e para o instalador assinado, além de trocar o endpoint de exemplo no momento apropriado. O endpoint configurado continua em `https://updates.example.invalid/...`; `.invalid` não hospeda serviço. Este script apenas gera o manifesto local.
