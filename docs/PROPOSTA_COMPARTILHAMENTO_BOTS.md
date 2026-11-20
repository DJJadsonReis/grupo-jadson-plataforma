# Proposta: compartilhar bots com pessoas e times

Status: aprovada em 2026-11-19. Esta proposta registra o modelo aprovado; a implementação será feita em commits separados.

## Situação atual

`agents` não tem dono; `AgentsController` lista e altera os bots sem filtrar por principal. A autenticação já identifica `sistema` ou uma pessoa (`users.id`) e tem papéis globais `admin`, `operator` e `viewer`. `agent_groups` agrupa bots, não pessoas; não há conceito de time/membership de usuários. O OpenBot separa a publicação do bot da audiência e permite audiência por pessoa ou grupo (`OpenBot/server/src/team-bots/access.ts` e `server/src/db/schema/team-bots.ts`).

## Modelo proposto

Cada bot novo pertence a uma pessoa. Compartilhamentos são concessões explícitas, sempre verificadas no backend. O papel global da pessoa (`admin`, `operator`, `viewer`) continua cuidando do acesso geral à API; não substitui o papel que ela recebe em um bot.

| Papel no bot | Ver e usar no chat | Ver instruções e política de ferramentas | Editar perfil, instruções e política | Compartilhar/remover pessoas ou times | Excluir bot |
|---|---:|---:|---:|---:|---:|
| Dono | Sim | Sim | Sim | Sim | Sim |
| Editor | Sim | Sim | Sim | Não | Não |
| Usuário | Sim | Não | Não | Não | Não |

Os papéis de compartilhamento seriam `editor` e `user`; `owner` é a relação única de propriedade, não uma concessão duplicável. Editores podem alterar instruções e ferramentas, mas não podem relaxar aprovações globais: ferramentas sensíveis continuam sujeitas ao fluxo atual de aprovação. Usuários podem conversar com o bot, mas não recebem os campos internos de configuração pela API.

### Pessoas e times

- Compartilhamento direto aponta para um `users.id` ativo.
- Um time é um grupo explícito de usuários, com identidade própria e membership. O conceito atual `agent_groups` não será reutilizado para isso, pois representa grupos de bots.
- Administradores globais criam times e mantêm seus membros. Donos de bots podem conceder/remover acesso a um time, mas não podem alterar o membership dele.
- Uma concessão a time pode ser `editor` ou `user`; a permissão efetiva é a mais alta entre a concessão direta e as concessões dos times da pessoa.
- Remover alguém do time remove imediatamente o acesso recebido por esse time, sem afetar uma concessão direta independente.

### Revogação, dados existentes e privacidade

- Só o dono pode remover concessões ou excluir o bot. A remoção é persistida e consultada em cada requisição; novas leituras, edições e mensagens ficam bloqueadas imediatamente após a revogação.
- Uma resposta que já esteja em geração pode terminar; revogar não apaga nem reescreve a conversa iniciada pela pessoa.
- Conversas, mensagens e memórias continuam pertencendo à pessoa que as criou. Compartilhar o bot compartilha somente o perfil executável, não o histórico ou a memória privada do dono.
- Bots existentes são migrados como bots do sistema (`sistema`), permanecem visíveis e utilizáveis como hoje, e só administradores globais podem alterá-los ou excluí-los. Isso evita trocar inadvertidamente o acesso dos bots já em uso.
- O histórico de conversas de cada pessoa não é transferido quando o dono de um bot muda. Transferência de propriedade fica fora da primeira versão; exclusão/desativação do usuário dono exige ação administrativa para reatribuir o bot.

## Esboço técnico para a implementação após aprovação

1. Migration aditiva para registrar `owner_id` em bots e concessões diretas ou por time; tabelas separadas para times e membership de usuários.
2. Passar o principal autenticado aos serviços de agentes e aplicar os filtros de acesso no SQL, inclusive em `GET`, `PATCH`, `DELETE` e na resolução do agente durante o chat.
3. Criar rotas de compartilhamento protegidas por propriedade do bot; o endpoint nunca aceita que o cliente escolha um `owner_id`.
4. Adicionar testes de isolamento entre principais, papel efetivo direto/time, revogação, usuário inativo, bots legados e bloqueio de edição/remoção por usuários e editores.

## Decisões aprovadas

1. Times são administrados apenas por administradores globais.
2. Editores de time podem editar o bot.
3. Bots atuais continuam com o dono `sistema`.
4. Conversas e memórias não são compartilhadas.
