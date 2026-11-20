# Token local do backend nos rebuilds

O token local do desktop é criado na primeira execução e salvo em `%LOCALAPPDATA%\GrupoJadson\setup.json`. O comando Tauri `get_first_run_api_token` relê esse arquivo; o backend também o lê no início por `applyDesktopSetup()` em `apps/backend/src/main.ts`.

## Precedência

Quando `setup.json` contém uma configuração válida, `databaseUrl` e `apiToken` desse arquivo são autoritativos. `applyDesktopSetup()` os aplica depois do carregamento de `dotenv/config`, portanto um `API_TOKEN` herdado do ambiente ou de `.env` não substitui o token local salvo. Se o arquivo estiver ausente ou inválido, o backend mantém os valores que já recebeu do ambiente; o desktop continua sem token local válido até que a configuração da primeira execução seja salva corretamente.

## Scripts de rebuild e inicialização

- Inicie o backend normalmente com `node dist/main.js` ou por `scripts/start.ps1`.
- Não exporte nem fixe `API_TOKEN` nos scripts de rebuild. O bootstrap do backend carrega a configuração local válida.
- Não copie, imprima ou registre o conteúdo de `setup.json`, `.env` ou variáveis de token nos logs.
- Se for preciso conferir a configuração, verifique apenas presença e validade estrutural sem mostrar o valor.

Os runners atuais que apenas compilam e iniciam `node dist/main.js` não precisam carregar ou transmitir o token. A regra centralizada em `applyDesktopSetup()` vale para os modos de inicialização do backend.
