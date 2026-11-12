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
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "tempo.agora", description: "Data e hora atuais do servidor.", risk: "read" },
  { name: "memoria.listar", description: "Lista as memórias salvas pela pessoa.", risk: "read" },
  { name: "memoria.apagar_tudo", description: "Apaga todas as memórias salvas. Exige aprovação.", risk: "sensitive" },
  { name: "busca.wikipedia", description: "Pesquisa na Wikipédia em português, sem chave de API.", risk: "read" },
  { name: "busca.web", description: "Pesquisa na web com o Tavily. Precisa da chave TAVILY_API_KEY no .env.", risk: "read" },
  { name: "agenda.listar_eventos", description: "Próximos eventos da Agenda Google da pessoa. Precisa de conexão Google.", risk: "read" },
  { name: "drive.listar_arquivos", description: "Arquivos recentes do Google Drive da pessoa. Precisa de conexão Google.", risk: "read" },
  { name: "computador.listar", description: "Lista arquivos de uma pasta da pasta de trabalho do Bot.", risk: "read" },
  { name: "computador.ler", description: "Lê um arquivo de texto da pasta de trabalho do Bot.", risk: "read" },
  { name: "computador.escrever", description: "Cria ou altera um arquivo de texto na pasta de trabalho do Bot. Exige aprovação.", risk: "sensitive" },
  { name: "notion.buscar", description: "Pesquisa páginas e bases no Notion. Precisa da integração Notion em Configurações.", risk: "read" },
  { name: "notion.criar_pagina", description: "Cria uma página no Notion dentro de outra página. Exige aprovação.", risk: "sensitive" },
  { name: "agenda.criar_evento", description: "Cria um evento na Agenda Google da pessoa. Exige aprovação.", risk: "sensitive" },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
