# Auditoria administrativa

A leitura da trilha de auditoria é restrita a pessoas com papel `admin`.

## Rotas

- `GET /api/v1/audit?limit=50`: lista legada, mantém a resposta como array e agora exige administrador.
- `GET /api/v1/audit/events`: busca paginada, exige administrador e responde `{ "items": [...], "nextCursor": "..." }`.

Na busca, `action` e `actor` fazem correspondência exata (até 80 caracteres). `from` é inclusivo e `to` exclusivo; ambos aceitam data ou data-hora ISO 8601. `limit` aceita inteiros de 1 a 100 e assume 50. Erros de intervalo, data, limite e cursor retornam 400 com `code` e `message`; demais papéis recebem 403 `FORBIDDEN`.

Os resultados são ordenados por `created_at DESC, id DESC`. O cursor é uma string Base64 URL-safe opaca que contém a data de criação e o UUID do último evento da página; o cliente deve devolvê-la sem interpretar. O servidor usa ambos os campos para continuar a busca sem pular eventos com timestamps iguais.

No desktop, a seção Auditoria em Atividades só consulta a API para administradores. Aprovações seguem as permissões existentes: decidir se `GET /approvals` também deve ser restrito a administradores permanece pendente para o dono.

No desktop, o filtro “Até” inclui o dia inteiro; o cliente envia o início local do dia seguinte, mantendo exclusivo o limite `to` do contrato da API.
