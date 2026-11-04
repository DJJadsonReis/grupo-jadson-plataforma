# Instalação, CI e distribuição Windows

## Fonte oficial de builds

O GitHub Actions é o ambiente oficial para instalar dependências, validar o monorepo e compilar os instaladores Windows. O computador local não precisa de Node, pnpm, Rust, MSVC, Windows SDK, PostgreSQL ou Redis para compilar o produto. Nenhum workflow instala ferramentas no Windows do usuário.

Os workflows usam `windows-latest`, Node.js 22 e pnpm 9.15.0. O build desktop instala Rust stable com target `x86_64-pc-windows-msvc`, prepara MSVC x64 e usa o WebView2 Runtime do runner. A instalação MSI/NSIS só ocorre depois de typecheck, testes desktop e backend com integração bem-sucedidos.

## Bootstrap revisável do lockfile

`pnpm-lock.yaml` ainda não está no estado atual do repositório. Depois que o workflow `bootstrap-lockfile.yml` estiver publicado na branch, abra **Actions → Bootstrap pnpm lockfile → Run workflow**. O workflow usa pnpm 9.15.0 e executa `pnpm install --lockfile-only --ignore-scripts`; não executa lifecycle scripts, não instala pacotes no workspace e verifica que os manifests não foram modificados. O resultado é entregue como artifact com metadados de commit e versões.

Revise o lockfile baixado. A aprovação e inclusão do arquivo em `main` são uma ação manual separada. Os demais workflows falham explicitamente se o lockfile aprovado estiver ausente e usam somente `pnpm install --frozen-lockfile`; builds normais nunca geram lockfile.

## Execução dos workflows

- `typecheck.yml`: PR e execução manual; TypeScript no runner Windows.
- `test-backend.yml`: PR e execução manual; testes Jest, migrations e smoke tests contra PostgreSQL 16 e Redis 7.2 descartáveis em runner Linux. É chamado também pelo build Windows como dependência obrigatória.
- `build-frontend.yml`: PR e execução manual; testes Vitest e build Vite em runner Windows.
- `build-windows.yml`: push em `main` e execução manual; aguarda backend/integration, executa typecheck e testes desktop, compila frontend/backend e cria MSI e NSIS pelo Tauri 2.
- `bootstrap-lockfile.yml`: somente manual; gera artifact para revisão, sem alterar o repositório remoto.

Todos têm permissão `contents: read`; nenhum usa secrets ou publica em Releases. Pull requests não recebem secrets. Os artifacts contêm os relatórios/logs de CI, builds e instaladores, identificados por versão, commit e arquitetura. Instaladores têm retenção de 90 dias; consulte a página **Actions** do repositório para baixar cada artifact. A disponibilidade começa somente após um workflow concluir e publicar o artifact.

## Estado atual e limitações

Na última validação local, o lockfile não existia; a geração offline falhou por falta de metadata do registry. Por isso, os workflows normais ainda não podem instalar dependências até que o artifact seja revisado e o lockfile aprovado seja adicionado à branch.

Os arquivos de workflow nesta cópia local ainda não foram publicados nem executados. As duas execuções remotas registradas na primeira publicação terminaram em `startup_failure` sem jobs executados; não há artifact de compilação ou instalador disponível. Consulte `ACOMPANHAMENTO_DESENVOLVIMENTO.md` e `ROADMAP.md` para o estado real. Nenhum build é declarado aprovado.

O job de backend usa serviços descartáveis e sem dados reais; pgvector é opcional e a migração testa o caminho relacional. Este job não testa credenciais de provedor externo. Não configure API Keys para executar CI.

## Desenvolvimento local opcional

A cópia local contém Node 22.23.4 e Corepack/pnpm 9.15.0 em diretórios do projeto, mas a máquina não tem a toolchain completa de Tauri. Eles podem ser usados para edição e validações que já tenham dependências presentes. A compilação/distribuição oficial permanece no GitHub Actions. Não use `corepack enable`, não instale ferramentas globalmente e não copie dados de banco/`.env` para artifacts.
# Estado do bootstrap remoto — 2026-11-03

O workflow local `.github/workflows/bootstrap-lockfile.yml` foi preparado para execução manual no runner Windows com Node 22 e pnpm 9.15.0. Ele resolve o lockfile sem scripts e publica o resultado como artifact para revisão, sem alterar `package.json` nem a branch.

O workflow ainda não está publicado em `main`; o remoto continua exibindo `generate-lockfile.yml`. Como a publicação foi expressamente vedada nesta fase, nenhum bootstrap foi executado e não há lockfile/artifact novo disponível. A validação completa com actionlint também depende de execução no runner. Depois de publicar o workflow autorizado, execute-o manualmente, revise o artifact e aprove o lockfile antes de habilitar instalações congeladas.
