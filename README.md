# Grupo Jadson — AI Agent Platform

Plataforma própria de agentes de IA com aplicativo desktop e execução local/cloud.

## Estado inicial
Este repositório contém a estrutura-base do monorepo, documentação inicial, configuração de ambiente e pontos de entrada dos módulos. **Ainda não representa todas as funcionalidades implementadas.**

## Requisitos
- Node.js 22 LTS
- pnpm 9+
- Rust stable (para Tauri)
- Docker + Docker Compose
- Git

## Começar
```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm dev
```

> O primeiro bootstrap do desktop/backend pode exigir a instalação das dependências do sistema indicadas na documentação do Tauri.

## Aplicações
- `apps/desktop`: aplicativo Tauri + React.
- `apps/backend`: API NestJS.
- `apps/web-admin`: painel administrativo web (base inicial).

## Pacotes
Os diretórios em `packages/` separam UI, tipos compartilhados, runtime de agentes, memória, ferramentas, segurança, banco e adaptadores de provedores.

## Documentação
Consulte `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SECURITY.md`, `docs/API.md` e `docs/INSTALLATION.md`.
Créditos e atribuições: `CREDITS.md`. A comparação técnica com referências externas e AG-UI está em `docs/AUDITORIA_REFERENCIAS_INTEGRACAO.md`.

## Princípios
- Não simular integrações como se fossem reais.
- Segredos apenas no backend e criptografados em repouso.
- Menor privilégio e aprovação humana para ações sensíveis.
- Cada fase deve ter testes e critérios de aceite.
