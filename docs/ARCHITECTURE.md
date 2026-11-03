# Arquitetura — Grupo Jadson

## Visão geral

Monorepo TypeScript com desktop Tauri, backend NestJS e pacotes de domínio desacoplados.

```text
Desktop (Tauri + React)
        |
        | HTTPS / WebSocket
        v
Backend API (NestJS) ---- Auth / Policy / Audit
        |
        +---- Agent Orchestrator
        |        +---- Agent Runtime
        |        +---- Tool Registry
        |        +---- Provider Gateway
        |        +---- Memory Engine
        |
        +---- PostgreSQL + pgvector
        +---- Redis / BullMQ
        +---- Object Storage (S3/MinIO)
        |
        +---- Local Runtime (desktop) ou Cloud Workers
```

## Decisões

- **Desktop:** Tauri 2 + React + TypeScript. A UI não recebe chaves secretas.
- **Backend:** NestJS para API, autenticação, autorização, WebSocket e coordenação.
- **Dados:** PostgreSQL como fonte principal; pgvector para recuperação semântica; Redis para cache e filas.
- **Agentes:** runtime independente do frontend, com execução rastreável e limites.
- **Ferramentas:** contratos tipados, validação de entrada, permissões e auditoria.
- **Local/cloud:** mesmo contrato de execução; muda o executor selecionado (local ou worker remoto).
- **Browser:** Playwright em processo/contêiner isolado.
- **Terminal:** nunca executar comandos arbitrários diretamente no processo da API.

## Fluxo de uma tarefa

1. Usuário envia mensagem ou tarefa.
2. API autentica usuário e verifica permissões.
3. Orquestrador cria execução e registra plano.
4. Runtime seleciona modelo e ferramentas autorizadas.
5. Ações sensíveis aguardam aprovação humana.
6. Resultados e eventos são transmitidos via WebSocket.
7. Histórico, custos, logs e memória são persistidos conforme política.

## Limites importantes

A estrutura inicial é um scaffold. Integrações de provedores, browser, terminal, computer-use, multimídia e cloud workers precisam ser implementadas e testadas antes de serem consideradas prontas.
