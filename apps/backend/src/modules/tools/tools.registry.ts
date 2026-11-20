/**
 * Ferramentas que um agente ou uma pessoa pode usar. Cada uma declara o nível de risco:
 * - "read": só consulta; roda na hora e fica registrada.
 * - "sensitive": altera dados; só roda depois que uma pessoa aprova.
 * Não há ferramenta que execute comandos do sistema operacional ou acesse arquivos locais.
 */
export type RiskLevel = "read" | "sensitive";

export interface ToolDefinition {
  name: string;
  description: string;
  risk: RiskLevel;
  parameters?: {
    properties: Record<string, { type: "string"; description: string }>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "tempo.agora", description: "Data e hora atuais do servidor.", risk: "read" },
  { name: "subagente.delegar", description: "Delega uma tarefa de leitura a outro turno isolado deste mesmo bot e devolve a resposta final.", risk: "read", parameters: { properties: { tarefa: { type: "string", description: "Tarefa isolada a executar, com até 2000 caracteres." } }, required: ["tarefa"] } },
  { name: "memoria.listar", description: "Lista as memórias salvas pela pessoa.", risk: "read" },
  { name: "memoria.apagar_tudo", description: "Apaga todas as memórias salvas. Exige aprovação.", risk: "sensitive" },
  { name: "busca.wikipedia", description: "Pesquisa na Wikipédia em português, sem chave de API.", risk: "read", parameters: { properties: { consulta: { type: "string", description: "Texto a pesquisar." } }, required: ["consulta"] } },
  { name: "pagina.ler", description: "Lê o texto de uma página pública da web, sem chave de API. Endereços locais e privados são bloqueados.", risk: "read", parameters: { properties: { url: { type: "string", description: "URL pública HTTP ou HTTPS da página." } }, required: ["url"] } },
  { name: "busca.web", description: "Pesquisa na web com o Tavily. Precisa da chave TAVILY_API_KEY no .env.", risk: "read", parameters: { properties: { consulta: { type: "string", description: "Texto a pesquisar." } }, required: ["consulta"] } },
  { name: "agenda.listar_eventos", description: "Próximos eventos da Agenda Google da pessoa. Precisa de conexão Google. Opcional: conexao_de (id da pessoa que liberou a conexão).", risk: "read", parameters: { properties: { conexao_de: { type: "string", description: "Id da pessoa que liberou a conexão Google, se aplicável." } } } },
  { name: "drive.listar_arquivos", description: "Arquivos recentes do Google Drive da pessoa. Precisa de conexão Google. Opcional: conexao_de (id da pessoa que liberou a conexão).", risk: "read", parameters: { properties: { conexao_de: { type: "string", description: "Id da pessoa que liberou a conexão Google, se aplicável." } } } },
  { name: "drive.criar_arquivo", description: "Cria um Google Doc no Drive da pessoa. Exige aprovação. Opcional: conexao_de (id da pessoa que liberou a conexão).", risk: "sensitive", parameters: { properties: { nome: { type: "string", description: "Título do documento (até 200 caracteres)." }, texto: { type: "string", description: "Texto do documento (até 100.000 bytes em UTF-8)." }, conexao_de: { type: "string", description: "Id da pessoa que liberou a conexão Google, se aplicável." } }, required: ["nome", "texto"] } },
  { name: "computador.listar", description: "Lista arquivos de uma pasta da pasta de trabalho do Bot.", risk: "read", parameters: { properties: { pasta: { type: "string", description: "Pasta relativa dentro de workspace." } } } },
  { name: "computador.ler", description: "Lê um arquivo de texto da pasta de trabalho do Bot.", risk: "read", parameters: { properties: { caminho: { type: "string", description: "Caminho relativo do arquivo dentro de workspace." } }, required: ["caminho"] } },
  { name: "computador.escrever", description: "Cria ou altera um arquivo de texto na pasta de trabalho do Bot. Exige aprovação.", risk: "sensitive" },
  { name: "notion.buscar", description: "Pesquisa páginas e bases no Notion. Precisa da integração Notion em Configurações.", risk: "read", parameters: { properties: { consulta: { type: "string", description: "Texto a pesquisar." } }, required: ["consulta"] } },
  { name: "notion.criar_pagina", description: "Cria uma página no Notion dentro de outra página. Exige aprovação.", risk: "sensitive" },
  { name: "notion.ler_pagina", description: "Lê o título e o texto dos blocos de uma página do Notion.", risk: "read", parameters: { properties: { pagina: { type: "string", description: "Id ou URL da página do Notion." } }, required: ["pagina"] } },
  { name: "notion.anexar_texto", description: "Acrescenta parágrafos ao fim de uma página no Notion. Exige aprovação.", risk: "sensitive", parameters: { properties: { pagina: { type: "string", description: "Id ou URL da página do Notion." }, texto: { type: "string", description: "Texto a acrescentar como parágrafos." } }, required: ["pagina", "texto"] } },
  { name: "agenda.criar_evento", description: "Cria um evento na Agenda Google da pessoa. Exige aprovação. Opcional: conexao_de (id da pessoa que liberou a conexão).", risk: "sensitive", parameters: { properties: { conexao_de: { type: "string", description: "Id da pessoa que liberou a conexão Google, se aplicável." } } } },
  { name: "atendimento.humano", description: "Registra um pedido interno de atendimento humano após aprovação; não envia mensagens externas.", risk: "sensitive", parameters: { properties: { motivo: { type: "string", description: "Por que a pessoa precisa de atendimento humano." }, conversaId: { type: "string", description: "Id da conversa relacionada, se disponível." } }, required: ["motivo"] } },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
