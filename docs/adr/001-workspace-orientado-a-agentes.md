# ADR 001 — Workspace orientado a agentes

- Estado: aceito para implementação incremental
- Data: 2026-11-03

## Contexto

O redesign organiza a experiência em torno de agentes persistentes, mantendo conversas como histórico associado. A interface precisa distinguir configuração de um agente de uma execução real. As telas não devem indicar presença, ferramentas ou serviços conectados sem fonte operacional.

## Decisões

1. Preservar Tauri 2, React, TypeScript, NestJS, PostgreSQL e Redis já definidos no projeto.
2. Usar a logo Grupo Jadson e a paleta preto, grafite e dourado existentes; não reutilizar marca ou ativos das referências.
3. Tratar o backend NestJS como autoridade para agentes e conversas quando as rotas e a conexão estiverem disponíveis; manter o armazenamento local como fallback explícito.
4. Conversas podem ter `agentId`; a migração aditiva `002-conversation-agent-link` cria a referência opcional à tabela de agentes. O frontend mantém cópia local como fallback.
5. Exibir “Pensando” somente durante uma chamada de chat real vinculada a um agente. “Habilitado” descreve a configuração do perfil; não equivale a “Ocioso” ou a uma conexão de runtime.
6. Reservar a execução de ferramentas a um gateway de permissões e auditoria no backend. A interface não simula ferramentas, aprovações, rotinas ou memória funcional.
7. Manter compatibilidade futura com AG-UI atrás da API NestJS. Não adicionar OpenBot como dependência: ele é uma referência de arquitetura/template que implica componentes adicionais e não um pacote plugável para o runtime atual.

## Consequências

- A sidebar, a lista de agentes e o histórico de conversas podem evoluir sem mudar a stack.
- A migração aditiva associa conversas aos agentes sem apagar o histórico. Sua aplicação e sincronização ainda precisam ser exercitadas em uma instância PostgreSQL real antes de declarar a persistência validada.
- Grupos, rotinas, memória, execução de ferramentas e workspace de computador permanecem pendentes até haver contratos, persistência, permissões e testes reais.
- AG-UI deve ser avaliado na etapa de eventos de execução: lifecycle, mensagens, chamadas de ferramenta, mudanças de estado e interrupções humanas; não substitui autenticação, política ou auditoria do produto.

## Referências consultadas

- [xAI — Designing Grok Bot for a world of persistent agents](https://x.ai/news/designing-grok-bot)
- [CopilotKit OpenBot](https://github.com/CopilotKit/openbot)
- [AG-UI — Overview](https://docs.ag-ui.com/introduction)
- [AG-UI — Architecture](https://docs.ag-ui.com/concepts/architecture)
