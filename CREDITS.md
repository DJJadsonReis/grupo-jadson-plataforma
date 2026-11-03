# Créditos e atribuições

## Grupo Jadson

**GRUPO JADSON** é o projeto e a identidade do produto.

- Criador e responsável: Jadson Reis
- X: [@djjadsonreis](https://x.com/djjadsonreis)
- Instagram: [@falajadson](https://instagram.com/falajadson)
- Logo e identidade visual: ativos originais do Grupo Jadson; não devem ser substituídos por marcas das referências.

## Referências de produto e arquitetura

As referências abaixo orientam estudo e decisões de produto. A consulta não significa que código ou ativos tenham sido copiados.

- [Designing Grok Bot — xAI](https://x.ai/news/designing-grok-bot): experiência de agentes persistentes e organização por agentes, conversas, ferramentas e artefatos.
- [OpenBot — CopilotKit](https://github.com/CopilotKit/openbot): template de agentes com computadores isolados, gateway de ações e integração AG-UI. Licença do repositório consultado: MIT; copyright © 2026 CopilotKit. Nenhum código do OpenBot foi incorporado nesta etapa. Se trechos forem reutilizados, manter o aviso de copyright e o texto MIT junto aos arquivos/avisos aplicáveis e registrar a origem.
- [Rakazo](https://github.com/elie222/rakazo): referência complementar de agentes persistentes, rotinas, memória, computadores e delegação. O repositório declara Apache-2.0. Nenhum código ou ativo foi incorporado nesta etapa.
- [AG-UI](https://docs.ag-ui.com/introduction): protocolo aberto de interação e eventos entre agente e interface; não substitui autenticação, autorização, auditoria ou persistência do produto.

## Software de código aberto

O projeto declara dependências em `package.json` e nos manifests de `apps/*` e `packages/*`. As dependências diretas incluem React, TypeScript, Vite, Tauri, NestJS, PostgreSQL (`pg`), Redis (`redis`), Lucide React, Jest e Vitest. Consulte os manifests para nomes e faixas de versão atualmente declaradas.

Ainda não há lockfile `pnpm-lock.yaml`; portanto, a árvore transitiva efetivamente instalada e seus avisos/licenças não foram inventariados nem validados nesta etapa. Antes de distribuir binários, gerar o lockfile com pnpm 9.15.0, produzir um inventário de licenças das dependências resolvidas e incluir os avisos exigidos por cada licença. Não atribuímos ao Grupo Jadson autoria de componentes de terceiros.

## Contribuições

Contribuições de terceiros devem incluir autoria, origem, licença e avisos exigidos. Não remover cabeçalhos de copyright. Alterações próprias devem ser identificadas como contribuições ao Grupo Jadson, sem reivindicar autoria de código externo.
