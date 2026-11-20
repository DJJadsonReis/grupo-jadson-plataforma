# Modo pessoal

O modo pessoal permite usar o Grupo Jadson em uma única máquina, por uma única pessoa, sem a tela de entrada por provedor. A autenticação da API continua ativa: o desktop usa o token local do sistema.

Para ativar no processo do backend, configure `GRUPO_EDICAO=pessoal` e `API_HOST=127.0.0.1`. Também são aceitos `::1` e `localhost` como endereço local; qualquer outro endereço impede o backend de iniciar neste modo. Sem `GRUPO_EDICAO`, o modo padrão continua sendo `equipe`.

No modo pessoal, ficam desligados os grupos de agentes, a administração de equipes, o compartilhamento de bots com pessoas ou times e a entrada por provedor de identidade. Ferramentas, bots, conversas, memória, habilidades, responsabilidades, tarefas e modelos permanecem disponíveis.

Este modo é destinado somente a uma pessoa usando uma máquina. Ele não deve ser exposto para uso em rede ou por várias pessoas.
