# Servidor MCP do Grupo Jadson

O servidor MCP expõe uma parte limitada da plataforma a clientes externos, sempre com as permissões da pessoa dona do token. A implementação desta etapa usa JSON-RPC 2.0 por HTTP em `POST /api/v1/mcp-server`. Não há SSE nem transporte stdio.

## Autenticação e tokens

Na tela **Configurações > Acesso MCP**, crie um token com nome próprio para cada cliente. O token completo aparece apenas na criação. O banco persiste somente o hash SHA-256; a lista mostra nome, criação, último uso e status. Revogar invalida o token imediatamente sem apagar seu registro.

O cliente envia `Authorization: Bearer <SEU_TOKEN>`. Cada requisição é associada ao `owner_id` do token; as operações de tarefas, memória, agentes, rotinas e notificações recebem esse identificador. Rotas para listar, criar e revogar tokens usam a autenticação normal da plataforma. Chamadas MCP são limitadas a 64 KB.

## Métodos MCP

Suportados: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list` e `prompts/get`. Requisições JSON-RPC inválidas retornam `-32700`; métodos desconhecidos retornam `-32601`. Notificações recebem HTTP 202 sem corpo.

## Ferramentas

| Nome | Função |
| --- | --- |
| `plataforma_status` | Versão e situação de PostgreSQL, pgvector, Redis e fila, sem segredo ou caminho local. |
| `tarefas_listar` | Lista tarefas não arquivadas da pessoa autenticada. |
| `tarefas_criar` | Cria tarefa para a pessoa autenticada (`title` obrigatório; `description` opcional). |
| `memoria_listar` | Lista memórias próprias; devolve lista vazia quando a memória está desligada. |
| `memoria_lembrar` | Salva memória própria respeitando a preferência de memória ligada. |
| `agentes_listar` | Lista agentes que a pessoa pode acessar, omitindo instruções internas e dados de endpoint. |
| `rotinas_listar` | Lista rotinas próprias. |
| `notificacoes_listar` | Lista notificações não lidas próprias. |

Esta tarefa enumerava oito ações concretas apesar de mencionar “6 ferramentas” em um critério. Foram incluídas todas as ações enumeradas acima. Nenhuma ferramenta de exclusão, conversa com agente, criação ou alteração de rotina foi publicada.

## Recursos e prompts

`resources/list` anuncia recursos `agente://{id}` apenas para agentes acessíveis. `resources/read` devolve metadados públicos do agente e nunca inclui o prompt de sistema, instruções internas ou segredo de endpoint. Documentos e base de conhecimento não fazem parte do escopo desta etapa.

`prompts/list` oferece:

- **Resumir minhas tarefas abertas** (`resumir_tarefas_abertas`): instrução para consultar tarefas e resumir prioridades e próximos passos.
- **Criar tarefa a partir de um texto** (`criar_tarefa_de_texto`): instrução para extrair ação e título e usar `tarefas_criar`, perguntando antes se faltar clareza.

Os prompts retornam somente instruções; não executam ações por conta própria.

## Auditoria e privacidade

Cada `tools/call` grava `mcp.call`, com o identificador da pessoa como ator, nome da ferramenta como assunto, os seis últimos caracteres do identificador do token e resultado `ok` ou código de erro. Argumentos e conteúdo de texto livre não entram na auditoria. O token em texto não é incluído em resposta MCP, logs ou evento de auditoria.

## Exemplo de configuração

Use o URL do backend acessível ao cliente e substitua o placeholder pelo token mostrado na criação:

```json
{
  "type": "http",
  "url": "http://127.0.0.1:3333/api/v1/mcp-server",
  "headers": {
    "Authorization": "Bearer <SEU_TOKEN>"
  }
}
```

O painel **Acesso MCP** gera o mesmo trecho usando o endereço configurado no desktop e sempre deixa `<SEU_TOKEN>` como placeholder.

## Fora desta etapa

- Transporte stdio: exige um processo-ponte local e será tratado separadamente.
- Conversar com agente: streaming e aprovações precisam de um fluxo próprio.
- Google Drive/Docs: depende da conexão OAuth da pessoa.
- Escrita de rotina: criação, alteração e exclusão de rotinas ficam fora do conjunto de ferramentas atual.
- Ferramentas de apagar qualquer dado: não são expostas.
