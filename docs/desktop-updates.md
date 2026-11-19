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
