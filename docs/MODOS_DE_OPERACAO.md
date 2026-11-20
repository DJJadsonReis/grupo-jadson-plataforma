# Modos de operação

O modo efetivo é aplicado pelo backend por conversa. `conversations.operation_mode` contém a escolha explícita; `NULL` herda `agents.default_operation_mode`, cujo padrão é `automatico`. A conversa sem agente usa `automatico`.

## Categorias de ferramenta

| Categoria | O que inclui |
|---|---|
| Leitura | Consultas sem alteração de estado |
| Escrita de arquivo | Criar ou alterar arquivo no workspace |
| Escrita de documento | Criar ou anexar conteúdo a documento |
| Escrita de memória | Alterar memórias salvas |
| Rede | Pesquisa ou leitura de páginas externas |
| Código | Delegação ou execução de trabalho de código |
| Envio | Criar evento/ação destinada a outra pessoa |
| Sensível | Apagar dados, atendimento ou ação sem categoria mais específica |

## Matriz

| Modo | Leitura | Escrita de arquivo/documento/memória | Rede/código | Envio/sensível |
|---|---|---|---|---|
| Automático | Executa | Executa | Executa | Pede aprovação |
| Manual | Executa | Pede aprovação | Pede aprovação | Pede aprovação |
| Aceitar edições | Executa | Executa | Pede aprovação | Pede aprovação |
| Planejamento | Executa | Bloqueia | Bloqueia | Bloqueia |
| Ignorar permissões | Executa | Executa | Executa | Executa |

Uma regra explícita `ask` continua pedindo aprovação. Uma regra explícita `deny` bloqueia em qualquer modo, incluindo Ignorar permissões. `allow` dispensa aprovação em Automático, Manual e Aceitar edições; Planejamento continua bloqueando alterações e envio, e `allow` nunca autoriza a ativação de Ignorar permissões. A ativação desse modo exige papel `admin` verificado no servidor e confirmação forte no desktop; a auditoria registra ator, conversa e modo.

## Ferramentas registradas

| Ferramenta | Categoria | Fundamentação |
|---|---|---|
| `tempo.agora` | Leitura | Data/hora do servidor |
| `subagente.delegar` | Sensível | Delega execução fora do ciclo síncrono, tratada restritivamente |
| `memoria.listar` | Leitura | Consulta memória |
| `memoria.apagar_tudo` | Sensível | Apaga dados |
| `busca.wikipedia` | Rede | Consulta web |
| `pagina.ler` | Rede | Busca conteúdo externo |
| `busca.web` | Rede | Pesquisa externa |
| `agenda.listar_eventos` | Leitura | Consulta agenda |
| `drive.listar_arquivos` | Leitura | Consulta Drive |
| `drive.criar_arquivo` | Escrita de documento | Cria Google Doc |
| `computador.listar` | Leitura | Lista workspace |
| `computador.ler` | Leitura | Lê arquivo do workspace |
| `computador.escrever` | Escrita de arquivo | Cria/altera arquivo do workspace |
| `notion.buscar` | Rede | Pesquisa no Notion |
| `notion.criar_pagina` | Escrita de documento | Cria página |
| `notion.ler_pagina` | Leitura | Consulta página |
| `notion.anexar_texto` | Escrita de documento | Anexa conteúdo |
| `agenda.criar_evento` | Envio | Cria evento para participantes |
| `atendimento.humano` | Sensível | Abre pedido de atendimento interno |
| Ferramentas MCP | Sensível | Categoria restritiva por padrão até haver metadados de categoria confiáveis |

## Interface

O seletor fica no composer, ao lado do modelo. `Alt+1` a `Alt+4` escolhem Automático, Manual, Aceitar edições e Planejamento quando o foco está na caixa de mensagem. Ignorar permissões não tem atalho; somente admin vê a opção e precisa digitar `IGNORAR PERMISSÕES` no modal de confirmação.

Planejamento bloqueia ferramentas de escrita e envio no servidor. A execução do plano requer uma decisão explícita da pessoa: sair de Planejamento e escolher Automático, Manual ou Aceitar edições no seletor. A ferramenta só pode agir depois que a nova escolha for salva no servidor.
