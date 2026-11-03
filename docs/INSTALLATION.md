# Instalação de desenvolvimento

## Pré-requisitos
- Node.js 22 LTS
- pnpm 9+
- Rust stable e toolchain do Tauri 2
- Docker Desktop ou Docker Engine com Compose
- Git

## Inicialização
```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis
```

## Verificação dos serviços
```bash
docker compose ps
```

## Próximos passos
O scaffold inicial ainda precisa do bootstrap dos projetos executáveis Tauri e NestJS. Consulte o `README.md` e o `ROADMAP.md`; não configure produção com as credenciais locais de exemplo.
