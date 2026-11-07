# Localização do repositório Git — Grupo Jadson

Data: 2026-11-07. Tipo: busca somente leitura. Nenhum `git init`, `clone`, `reset`, `checkout`, `clean`, `push` ou alteração de arquivo foi executado. Nenhum `.env` foi aberto. Nenhuma credencial ou token foi exibido: URLs de remoto foram lidas sem nenhuma parte de autenticação.

## 1. Resultado em uma frase

**`T:\grupo-jadson` é a única cópia do Grupo Jadson encontrada no computador, e ela não tem histórico Git.** Não há nenhum `.git` dentro dela, nem em `referência externa/`, nem em `tools/`. O commit `faec347…` citado no diário não pôde ser verificado localmente.

## 2. Buscas realizadas

| Local pesquisado | Profundidade | Resultado |
|---|---|---|
| `T:\` | até 4 níveis | 7 pastas `.git` (todas de outros projetos, ver seção 3) |
| `T:\grupo-jadson` | qualquer nível | nenhuma pasta `.git` |
| `C:\Users\Usuario` (exceto AppData) | até 4 níveis | nenhuma pasta `.git` |
| Nomes contendo `grupo`/`jadson` em `T:\` e no perfil | até 5 níveis | só `T:\grupo-jadson`, `base-jadson` (projeto diferente) e arquivos derivados |
| `package.json` com `@grupo-jadson/backend` em `T:\` | — | apenas `T:\grupo-jadson\apps\backend\package.json` |
| Arquivos `.zip` ou pastas com nome do projeto em Downloads, Desktop e Documents | até 3 níveis | nenhum clone ou backup do Grupo Jadson |
| `referência externa/` | até 2 níveis | sem `.git` |

## 3. Pastas `.git` encontradas em `T:\` (outros projetos)

Nenhuma delas é o Grupo Jadson. Estão listadas só para descartar.

| Caminho | Remoto (sem credenciais) |
|---|---|
| `T:\Achadinhos\.git` | não lido |
| `T:\base-jadson\.git` | `DJJadsonReis/base-jadson` |
| `T:\base-jadson\site\.publish\jc-oficial\.git` | `DJJadsonReis/jc-oficial` |
| `T:\base-jadson\site\.upload\jc-oficial\.git` | `DJJadsonReis/jc-oficial` |
| `T:\menos-pista\menospista\src\.git` | não lido |
| `T:\menos-pista\menospista-admin\.git` | `DJJadsonReis/menos-pista-admin` |
| `T:\menos-pista\menospista-pay\.git` | `DJJadsonReis/menos-pista-pay` |
| `T:\menos-pista\menospista-site\.git` | `DJJadsonReis/menos-pista` |
| `T:\menos-pista\backup\mission-20261106-171018\…` (3 pastas) | cópias de backup dos repositórios acima |
| `T:\passei-cnh\.git-commit-worktree\.git` | `DJJadsonReis/passei-cnh` |

Observação: as cópias em `menos-pista\backup` são backups de outro projeto. Não tocar.

## 4. Remoto esperado e divergência de nome

- O diário (`ACOMPANHAMENTO_DESENVOLVIMENTO.md`) registra `origin` = `https://github.com/DJJadsonReis/grupo-jadson-plataforma.git` e commit `faec347e30780165d6792d6ad5af82b8e0a6b83b` na `main`.
- O script `scripts/connect-github-repo.ps1` usa **`grupo-jadson-platform`** (sem "a" final).
- Ou seja: há duas grafias do nome do repositório no próprio projeto. Antes de qualquer `push` ou `pull`, é preciso confirmar no GitHub qual nome existe. Não confirmei isso: o repositório é privado e não há acesso autenticado nesta sessão.

## 5. Branch principal e commit mais recente

- Branch principal esperada: `main` (segundo o diário).
- Commit mais recente registrado: `faec347e30780165d6792d6ad5af82b8e0a6b83b` (`chore: initial Grupo Jadson platform`, 124 arquivos). **Não verificado localmente**, porque não há histórico no disco.

## 6. Ferramentas Git no computador

- `git` no PATH: `git version 2.56.0.windows.4`, instalado em `C:\Program Files\Git\cmd\git.exe`.
- `tools\git\` existe, mas está **vazio**. O diário descrevia um Git portátil ali (Git for Windows 2.53.0, ignorado pelo `.gitignore`). Esse conteúdo não está mais no disco.
- Ao rodar `git` no diretório do projeto, o resultado é `fatal: not a git repository`, porque não há `.git`.

## 7. Comparação entre as cópias

Só existe uma cópia do Grupo Jadson, então não há diferença a comparar. Itens que indicam o estado atual da pasta:

- Arquivos presentes: `apps/`, `packages/`, `docs/`, `scripts/`, `.github/workflows/`, `referência externa/`, `ACOMPANHAMENTO_DESENVOLVIMENTO.md`, `docs/ANALISE_REAPROVEITAMENTO_REFERENCIAS.md` (criado nesta rodada) e `docs/AUDITORIA_ESTADO_ATUAL.md` (criado nesta rodada).
- `.gitignore` continua com regras de Git (`/tools/git/*`), ou seja, a configuração do repositório existia; só o `.git` sumiu.
- `referência externa/` foi adicionado à raiz depois da missão de reaproveitamento (não estava no commit inicial, conforme o diário, que não o menciona). Não é possível confirmar sem o histórico se ele foi versionado depois.

## 8. Hipóteses sobre o desaparecimento do `.git`

Não há elementos suficientes para afirmar a causa. Hipóteses a verificar:
1. Cópia ou sincronização da pasta que não incluiu o diretório oculto `.git`.
2. Remoção manual ou limpeza de pastas ocultas.
3. O repositório foi criado em outro diretório (verificado: não está em `T:\`, perfil do usuário, nem nos clones de outros projetos).

## 9. Recomendação

1. **Considerar `T:\grupo-jadson` como a versão oficial de trabalho**, porque é a única cópia existente e contém todas as alterações recentes (documentos de auditoria, análise do referência externa).
2. **Não alterar a pasta até restaurar o histórico.** Antes de qualquer mudança, preservar uma cópia de segurança fora de `T:\grupo-jadson`.
3. **Restaurar o histórico em uma pasta nova, não na atual:** clonar do GitHub (`DJJadsonReis/grupo-jadson-plataforma`, se for o nome correto) para uma pasta separada, por exemplo `T:\grupo-jadson-git`. Depois, comparar os arquivos com `T:\grupo-jadson` e decidir o que trazer de volta.
4. Antes do clone, confirmar o nome exato do repositório no GitHub (ver seção 4) e o login do usuário no GitHub.
5. Depois de restaurado, o `.git` da pasta oficial pode ser recriado a partir do clone, sem sobrescrever os arquivos atuais.

## 10. Aguardando autorização

Nenhuma recuperação ou sincronização foi feita. Para seguir, é preciso sua autorização para:
- clonar o repositório do GitHub em uma pasta nova (ação de rede e de disco);
- fazer a comparação entre a cópia restaurada e `T:\grupo-jadson`.
