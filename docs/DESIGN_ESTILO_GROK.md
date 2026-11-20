# Design do desktop: conversa escura e direta

## 1. Estado atual

O desktop já tem camadas de estilo em `apps/desktop/src/styles/`: `design-tokens.css` define a paleta institucional dourada, fontes de sistema, escalas e raios; `global.css` contém a base e componentes gerais; `shell-redesign.css` simplifica a barra lateral e o chat; `chat-grok.css` dá estilo à conversa; e `workspace.css` reúne telas, painéis e componentes que foram sendo acrescentados. `App.tsx` e componentes sob `components/` fornecem os rótulos e mensagens. A lista já usa prévia pura de `apps/desktop/src/lib/preview.ts`, avatar de 36 px e nome/prévia, mas havia regras repetidas e o avatar do agente fixo recebia tratamentos diferentes. O composer já preservava os controles de ditado, modelo, esforço e modo; tinha contorno e sombra fortes.

O desktop usa fontes locais/sistema (`Segoe UI`, `Inter`, `system-ui`), sem depender de fonte remota. Os tokens deste trabalho acrescentam nomes semânticos de fundo, texto, peso e raio, preservando a paleta e o logo do Grupo Jadson. `apps/web-admin` não existe neste repositório e não será criado. Mensagens de erro produzidas pelo backend ficam fora do escopo e não são reescritas.

## 2. O que muda por tela

| Tela | Direção |
| --- | --- |
| Barra lateral e conversas | Fundo escuro neutro, menos divisórias, linhas com avatar circular de 36 px, nome em negrito e prévia cinza em uma linha; seleção e hover com superfície suave. Seções Agentes e Conversas permanecem claras. |
| Conversa | Coluna de leitura limpa, fundo escuro, texto com bom contraste e painéis de contexto com cantos uniformes. Marca e avatares próprios permanecem. |
| Composer | Cápsula arredondada no rodapé, superfície discreta e controles atuais de ditado, modelo, esforço, modo e envio preservados. Nenhum comportamento dos controles muda. |
| Configurações: Modelos e provedores | Manter os fluxos existentes e aplicar a mesma escala de superfícies e raios a formulários e cartões. |
| Configurações: MCP | Manter configuração local/remota, nomes técnicos necessários e mensagens de segurança; usar painéis discretos e rótulos diretos. |
| Configurações: Notificações | Manter ações explícitas de leitura e estados vazios; reduzir ruído visual nos cartões. |
| Tarefas | Manter os campos e ações; aplicar superfície e raio de cartão consistentes e rótulos curtos. |
| Agentes | Preservar mascotes, logo e dourado institucional; alinhar cartões, modais e lista de agentes aos tokens de superfície e raio. |
| Web-admin | Não existe no repositório; não aplicável nesta entrega. |

## 3. Tokens propostos

| Token | Valor/família | Uso |
| --- | --- | --- |
| `--gj-bg-dark` | `--gj-canvas` (`#0b0b0b`) | Fundo principal escuro. |
| `--gj-text-primary` | `--gj-text` (`#f5f2ea`) | Texto principal com contraste. |
| `--gj-text-secondary-contrast` | `--gj-text-muted` (`#96938a`) | Prévia e texto secundário. |
| `--gj-card-radius` | `1rem` | Cartões e painéis. |
| `--gj-composer-radius` | `1.375rem` | Composer arredondado. |
| `--gj-font-weight-regular/medium/semibold/bold` | `400/500/600/700` | Hierarquia de texto. |
| `--gj-space-*` | escala existente de `0.25rem` a `2.5rem` | Espaçamento consistente. |

O dourado e o logo continuam sendo os do Grupo Jadson. Não há marca, logo ou ícone do Grok na interface. As fontes continuam locais/sistema; nenhuma fonte remota ou dependência foi adicionada.

## 4. Revisão dos textos visíveis

Inventário dos rótulos e mensagens estáticas da interface desktop, agrupado por arquivo. Conteúdo dinâmico fornecido por usuários, agentes, provedores, notificações ou pela API não é texto fixo para revisão. Em especial, erros do backend ficam fora do escopo. `aplicar` indica texto alterado nesta tarefa; `remover` indica remoção; `manter` indica redação adequada, rótulo técnico necessário ou conteúdo dinâmico.

### `apps/desktop/src/App.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Entrar no Grupo Jadson | Entrada | Entrar no Grupo Jadson | manter | Identifica a empresa. |
| Use a mesma conta cadastrada para você no sistema. | Entrada | Use a conta cadastrada para você no sistema. | aplicar | Frase mais direta. |
| Carregando… | Inicialização | Carregando… | manter | Estado curto e familiar. |
| Modelos e provedores | Navegação/configurações | Modelos e provedores | manter | Nome claro da área. |
| Configurações | Navegação/conta | Configurações | manter | Rótulo conhecido. |
| Abrir menu / Fechar menu / Expandir menu / Recolher menu | Acessibilidade da barra | Manter | manter | Ações acessíveis claras. |
| Redimensionar menu lateral | Acessibilidade da barra | Manter | manter | Descreve o controle. |
| Buscar conversas | Busca lateral | Buscar conversas | manter | Ação clara. |
| Nova conversa | Barra lateral/ações | Nova conversa | manter | Ação clara. |
| Atendimento | Navegação | Atendimento | manter | Nome funcional da área. |
| Notificações | Navegação | Notificações | manter | Nome claro da área. |
| Agentes | Barra lateral | Agentes | manter | Seção clara. |
| Conversas | Barra lateral | Conversas | manter | Seção clara. |
| Conversar com a equipe | Barra lateral | Manter | manter | Ação acessível da sala. |
| Equipe · N bots | Barra lateral | Equipe · N bots | manter | Resumo dinâmico útil. |
| Sem mensagens ainda | Barra lateral | Sem mensagens ainda | manter | Estado vazio claro. |
| Em execução… | Barra lateral | Em execução… | manter | Estado de atividade. |
| Renomear | Menu da conversa | Renomear | manter | Ação direta. |
| Excluir | Menu da conversa | Excluir | manter | Ação direta. |
| Novo nome da conversa | Edição da conversa | Manter | manter | Rótulo acessível. |
| Excluir conversa? | Confirmação | Excluir conversa? | manter | Confirma ação destrutiva. |
| Excluir esta conversa e todo o histórico? Não dá para desfazer. | Confirmação | Manter | manter | Explica consequência e irreversibilidade. |
| Cancelar | Confirmações | Cancelar | manter | Ação padrão. |
| O backend recusou a sessão local. Reconecte para tentar novamente. | Aviso de sessão | Manter | manter | Texto claro; comportamento não é parte do redesign. |
| Controlador | Navegação | Controlador | manter | Nome da área. |
| O que você gostaria de explorar, orquestrar ou construir agora? | Início | O que você gostaria de fazer agora? | aplicar | Simplifica sem perder o convite. |
| Como o Grupo Jadson pode ajudar você agora? Digite sua ideia ou comando… | Início | O que você quer fazer? Escreva uma ideia ou comando… | aplicar | Mais curto e direto. |
| Descreva sua tarefa | Início/acessibilidade | Descreva sua tarefa | manter | Explica o campo. |
| Assistente Geral (Padrão) | Início/seletor | Assistente geral (padrão) | aplicar | Capitalização natural. |
| Iniciar | Início/ação | Iniciar | manter | Ação objetiva. |
| Sugestões rápidas: | Início | Sugestões rápidas: | manter | Introduz as sugestões. |
| EQUIPE DE IA | Início | Equipe de IA | aplicar | Evita caixa alta integral. |
| Agentes Especialistas | Início | Agentes especialistas | aplicar | Capitalização natural. |
| Nenhum perfil de agente criado ainda. | Início | Ainda não há agentes. | aplicar | Mais curto e natural. |
| HISTÓRICO | Início | Histórico | aplicar | Evita caixa alta integral. |
| Continuar Conversas | Início | Continuar conversas | aplicar | Capitalização natural. |
| Nenhuma conversa ativa no momento. | Início | Nenhuma conversa ativa no momento. | manter | Estado vazio claro. |
| Ditar mensagem localmente | Composer/acessibilidade | Ditar mensagem | aplicar | “Localmente” é detalhe técnico desnecessário. |
| O ditado precisa do serviço local neste computador. | Composer/acessibilidade | O ditado precisa do serviço local neste computador. | manter | Explica indisponibilidade. |
| Escutando… | Composer/ditado | Escutando… | manter | Estado curto. |
| Parar / Enviar / Cancelar | Composer/ditado | Manter | manter | Ações claras; comportamento já existente. |
| Baixar modelo de voz | Composer/ditado | Baixar modelo de voz | manter | Identifica a ação. |
| O reconhecimento de voz precisa baixar um modelo de cerca de N MB, uma vez, para este computador. Nenhum áudio sai do computador. | Composer/ditado | Manter | manter | Informa tamanho, frequência e privacidade. |
| Baixar | Composer/ditado | Baixar | manter | Ação clara. |
| Buscar | Busca global | Buscar | manter | Ação curta. |
| Buscar bots, chats, configurações... | Busca global | Buscar agentes, conversas e configurações… | aplicar | Usa nomes da interface e reticências tipográficas. |
| Bots / Ações / Telas | Busca global | Agentes / Ações / Telas | aplicar | “Agentes” é o termo usado na interface. |
| Conectar aplicativos | Busca global | Conectar aplicativos | manter | Ação clara. |
| Chaves de serviços e modelo de IA em Configurações | Busca global | Chaves de serviços e modelos de IA em Configurações | aplicar | Concordância com múltiplos modelos. |
| O que vamos construir hoje? | Conversa vazia | O que vamos construir hoje? | manter | Convite simples. |
| Envie instruções, analise dados ou peça ajuda a um agente da equipe. | Conversa vazia | Envie instruções, analise dados ou peça ajuda a um agente. | aplicar | Remove redundância de “da equipe”. |
| Escolha um agente | Delegação | Escolha um agente | manter | Instrução objetiva. |
| Delegar conversa a outro agente | Acessibilidade | Delegar conversa a outro agente | manter | Explica o controle. |
| Ativar modo foco / Sair do modo foco | Conversa/acessibilidade | Manter | manter | Ações claras. |
| Fechar aviso | Conversa/acessibilidade | Fechar aviso | manter | Ação acessível. |
| Anexar imagem, código ou PDF | Composer | Anexar imagem, código ou PDF | manter | Lista formatos suportados. |
| Mensagem para o Grupo Jadson | Composer | Escreva uma mensagem… | aplicar | Placeholder mais direto e reutilizável. |
| Modo de operação | Composer | Modo de operação | manter | Nome funcional do seletor. |
| Automático · Alt+1 / Manual · Alt+2 / Aceitar edições · Alt+3 / Planejamento · Alt+4 / Ignorar permissões | Composer | Manter | manter | Nomes e atalhos são necessários. |
| Modelo usado nesta conversa | Composer | Modelo desta conversa | aplicar | Rótulo mais curto. |
| Esforço de raciocínio | Composer | Esforço de raciocínio | manter | Termo já mapeado na funcionalidade. |
| Padrão / Resposta por @menção / Participante do grupo / Perfil associado | Composer | Manter | manter | Opções necessárias ao comportamento. |
| Parar geração / Enviar mensagem | Composer/acessibilidade | Manter | manter | Ações acessíveis. |
| Ignorar permissões? | Confirmação do modo | Ignorar permissões? | manter | Confirma ação sensível. |
| Este modo permite que o agente execute ferramentas sem pedir aprovação. A ativação e cada execução ficam registradas na auditoria. | Confirmação do modo | Manter | manter | Explica efeito e auditoria. |
| Digite IGNORAR PERMISSÕES para confirmar | Confirmação do modo | Manter | manter | Confirmação deliberada. |
| Ativar | Confirmação do modo | Ativar | manter | Ação explícita. |
| O histórico fica neste dispositivo. As respostas dependem do modelo configurado em Configurações. | Composer | O histórico fica neste dispositivo. As respostas usam o modelo configurado em Configurações. | aplicar | Frase mais natural. |
| Painel de contexto / Editar avatar | Painel/acessibilidade | Manter | manter | Identifica painel e ação. |

### `apps/desktop/src/Welcome.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Vamos preparar o Grupo Jadson | Primeira execução | Vamos preparar o Grupo Jadson | manter | Acolhedor e direto. |
| Este assistente verifica os serviços locais e salva a configuração mínima neste computador. | Primeira execução | Este assistente verifica os serviços locais e salva a configuração neste computador. | aplicar | “Mínima” não ajuda a pessoa. |
| Backend e PostgreSQL / Extensão pgvector / Redis | Primeira execução | Manter | manter | Nomes técnicos necessários. |
| Conectado / Disponível / Opcional | Primeira execução | Manter | manter | Estados curtos. |
| Backend ativo, PostgreSQL indisponível / Backend indisponível | Primeira execução | Manter | manter | Informa estado real do serviço. |
| Não detectada; recursos de memória vetorial podem ficar indisponíveis | Primeira execução | Manter | manter | Explica o efeito da ausência. |
| Necessário para a fila configurada / Opcional; a fila local em memória é usada | Primeira execução | Manter | manter | Distingue necessidade e alternativa. |
| Endereço PostgreSQL | Primeira execução | Endereço do PostgreSQL | aplicar | Leitura mais natural. |
| A senha fica no arquivo local de configuração do aplicativo e não é exibida novamente. | Primeira execução | A senha fica salva neste computador e não será exibida novamente. | aplicar | Frase mais clara sem detalhe interno. |
| Salvar configuração local | Primeira execução | Salvar configuração | aplicar | Localidade já explicada na tela. |
| Instalar PostgreSQL portátil | Primeira execução | Instalar PostgreSQL portátil | manter | Nome da opção. |
| Instalar PostgreSQL | Primeira execução | Instalar PostgreSQL | manter | Ação clara. |
| Confirmar e instalar | Confirmação | Confirmar e instalar | manter | Confirma consequência. |
| Iniciar serviços locais | Primeira execução | Iniciar serviços locais | manter | Ação clara. |
| Iniciar serviços locais? | Confirmação | Iniciar serviços locais? | manter | Confirma execução. |
| O assistente não oferece substituição da instalação existente. | Primeira execução | Manter | manter | Explica limite importante. |

### `apps/desktop/src/components/mcp/McpServersPanel.tsx` e `McpAccessPanel.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Servidores MCP | Configurações > MCP | Servidores MCP | manter | Nome do protocolo. |
| Servidores locais conectados às ferramentas da plataforma. | Configurações > MCP | Servidores conectados às ferramentas da plataforma. | aplicar | Abrange também transporte remoto. |
| Editar / Remover / Adicionar servidor / Salvar servidor / Cancelar | Configurações > MCP | Manter | manter | Ações diretas. |
| Nome / Transporte / Local (stdio) / Remoto (HTTP) | Configurações > MCP | Manter | manter | Rótulos técnicos necessários. |
| Cabeçalhos HTTP (opcional; valores secretos) | Configurações > MCP | Cabeçalhos HTTP (opcionais; podem conter segredos) | aplicar | Concordância e alerta mais claro. |
| Comando / Argumentos (um por linha) / Variáveis de ambiente (chave/valor; campos sensíveis) | Configurações > MCP | Manter | manter | Descreve campos técnicos. |
| Ligado / Adicionar variável / Chave da variável / Valor da variável / Já salvo / Valor | Configurações > MCP | Manter | manter | Rótulos funcionais e compactos. |
| Acesso MCP | Configurações > MCP | Acesso MCP | manter | Nome do recurso. |
| Nome do token / Criar token / Copiar token / Fechar / Revogar | Configurações > MCP | Manter | manter | Ações precisas de segurança. |
| Revogar token? | Configurações > MCP | Revogar token? | manter | Confirma ação. |
| O cliente perderá acesso imediatamente. | Configurações > MCP | Este cliente perderá o acesso imediatamente. | aplicar | Frase completa e clara. |

### `apps/desktop/src/components/notifications/NotificationsPanel.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| CENTRAL DE AVISOS | Configurações > Notificações | Central de avisos | aplicar | Evita caixa alta integral. |
| Notificações | Configurações > Notificações | Notificações | manter | Nome claro. |
| Marcar todas como lidas / Marcar como lida | Configurações > Notificações | Manter | manter | Ações inequívocas. |
| Não foi possível carregar as notificações. | Configurações > Notificações | Não foi possível carregar as notificações. | manter | Erro local de carregamento. |
| Nenhuma notificação não lida. | Configurações > Notificações | Você não tem avisos pendentes. | aplicar | Evita dupla negação. |

### `apps/desktop/src/components/tasks/TasksPage.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Tarefas / Nova tarefa | Tarefas | Manter | manter | Títulos claros. |
| Título / Descrição / Status | Tarefas | Manter | manter | Rótulos conhecidos. |
| Criar tarefa / Criando... / Salvar / Cancelar / Editar / Arquivar | Tarefas | Manter | manter | Ações curtas. |
| Carregando tarefas... | Tarefas | Carregando tarefas… | aplicar | Padroniza a reticência. |
| Tentar de novo | Tarefas | Tentar de novo | manter | Ação clara. |
| Nenhuma tarefa ainda. | Tarefas | Ainda não há tarefas. | aplicar | Estado vazio mais natural. |

### `apps/desktop/src/components/status/StatusPanel.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| SISTEMA | Status | Sistema | aplicar | Evita caixa alta integral. |
| Status das dependências | Status | Status dos serviços | aplicar | Nome familiar e direto. |
| Estado dos serviços usados pelo aplicativo. | Status | Estado dos serviços usados pelo aplicativo. | manter | Descrição clara. |
| Verificando… / Verificar de novo | Status | Manter | manter | Estado e ação claros. |

### `apps/desktop/src/components/team/TeamRoomsPage.tsx`

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Equipe / Salas da equipe | Equipe | Manter | manter | Nomes claros. |
| Nova sala / Criar sala / Convidar pessoa / Sair da sala | Equipe | Manter | manter | Ações claras. |
| Carregando salas... | Equipe | Carregando salas… | aplicar | Padroniza a reticência. |
| Nenhuma sala ainda. | Equipe | Ainda não há salas. | aplicar | Simplifica o estado vazio. |
| Escolha uma sala para ver a conversa. | Equipe | Escolha uma sala para ver as mensagens. | aplicar | Termo mais específico. |
| Selecione uma pessoa / Pessoa para convidar | Equipe | Manter | manter | Instrução necessária. |
| Mensagem / Enviar | Equipe | Manter | manter | Rótulo e ação curtos. |

### Demais componentes e telas do desktop

| Texto atual | Tela/local | Proposta | Ação | Motivo |
| --- | --- | --- | --- | --- |
| Conteúdo dinâmico de agentes, usuários, tarefas, salas e notificações | Várias telas | Manter o conteúdo fornecido pela pessoa ou serviço | manter | Não é texto fixo da interface. |
| Mensagens de erro retornadas pela API/backend | Várias telas | Fora do escopo: não reescrever respostas do backend | manter | A tarefa exclui mudanças no backend. |
| Textos restantes de formulários e ações em `components/` | Preferências, habilidades, conexões, responsabilidades, rotinas, tour e demais telas | Manter onde o rótulo já descreve a ação ou o campo | manter | Não há alteração proposta sem benefício claro; conteúdo dinâmico continua intacto. |

## 5. Tamanho estimado

Estimativa inicial: **M (1–2 dias)** para inventário da UI, alinhamento visual das superfícies principais, revisão e aplicação dos textos, teste dos tokens, typecheck, suíte desktop e conferência visual. O web-admin inexistente e as mensagens do backend não entram na estimativa. Nesta execução, a aplicação textual foi restrita às linhas `aplicar` implementadas no código e registradas no relatório.
