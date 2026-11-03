# API — contrato inicial

Prefixo sugerido: `/api/v1`

## Endpoints planejados

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/health` | Saúde da API |
| GET/POST | `/agents` | Listar/criar agentes |
| GET/PATCH/DELETE | `/agents/:id` | Consultar/editar/remover agente |
| GET/POST | `/conversations` | Listar/criar conversas |
| POST | `/conversations/:id/messages` | Enviar mensagem |
| POST | `/runs` | Criar execução de agente |
| GET | `/runs/:id` | Consultar execução |
| POST | `/runs/:id/cancel` | Cancelar execução |
| GET/POST | `/automations` | Listar/criar automações |
| GET | `/providers` | Consultar provedores configurados |

Os endpoints acima são um contrato planejado, não uma declaração de que já estão implementados.

## Recursos implementados verificados no código

- `GET /agents`: lista agentes no PostgreSQL.
- `POST /agents`: cria agente; `id` UUID é opcional. Se omitido, a API gera um. Se houver conflito no UUID informado, retorna o registro existente sem sobrescrevê-lo, permitindo sincronização idempotente de um perfil local.
- `PATCH /agents/:id`: atualiza os campos enviados.
- `DELETE /agents/:id`: remove agente.
- O backend também expõe health, listagem/criação de conversas e `POST /chat/completions` com streaming SSE conforme a implementação atual.

`POST /conversations` e `POST /chat/completions` aceitam `agentId` opcional validado. A migração `002-conversation-agent-link` adiciona `conversations.agent_id` como referência opcional a `agents` com `ON DELETE SET NULL`. O desktop mantém cópia local. A migração e o fluxo ainda precisam ser executados contra PostgreSQL antes de declarar validação operacional.

## Compatibilidade futura com AG-UI

O endpoint `POST /chat/completions` atual encaminha SSE compatível com o formato OpenAI; ele não implementa os eventos nem o ciclo de execução AG-UI. A integração está planejada como contrato de execução atrás do NestJS, com persistência e autorização mantidas no backend. Não há endpoint AG-UI operacional ainda. O inventário de diferenças e os critérios de evolução estão em [AUDITORIA_OPENBOT_INTEGRACAO.md](AUDITORIA_OPENBOT_INTEGRACAO.md).
