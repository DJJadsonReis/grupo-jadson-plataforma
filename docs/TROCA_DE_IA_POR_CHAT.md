# Troca de IA por conversa

## Precedência

Ao responder, o backend usa (a) a escolha salva na conversa se o provedor e o modelo continuam disponíveis; (b) sem escolha válida, o modelo principal do agente e sua cadeia de reservas `modelRouting`; (c) sem modelo de agente, o padrão já usado pelo chat. Uma escolha explícita no seletor inicia o roteamento e os fallbacks do agente continuam disponíveis depois dela.

## Persistência e indisponibilidade

A escolha fica em `conversations.model_provider_id` e `conversations.model`. Nulos nos dois campos indicam o padrão. Trocar a escolha só afeta respostas futuras; o histórico não é reescrito. O `PUT` valida o modelo e recusa indisponibilidade com HTTP 409. Se o modelo salvo ficar indisponível ou o provedor for removido, o backend mantém a escolha e usa o agente ou o padrão, registrando o motivo sem dados de chave.

## API

- `GET /api/v1/conversations/:id/model` lê a escolha da pessoa dona da conversa.
- `PUT /api/v1/conversations/:id/model` aceita `{ "providerId": "<uuid>", "model": "<id>" }` ou `{ "providerId": null, "model": null }`.
- O seletor usa a lista central de `GET /api/v1/model-providers/selectable` e mostra provedor e modelo.

## Etapas e escopo

Persistência e migração: P. Rotas e validações: P. Precedência no chat e preservação dos fallbacks/esforço: M. Seletor desktop e persistência visual: M. A tarefa cobre o backend, banco, desktop e testes automatizados. Teste visual de DOM, alteração de provedores e modelos por tarefa ficam fora.
