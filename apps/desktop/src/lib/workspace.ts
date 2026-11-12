export type ChatRole = "user" | "assistant";

export interface AgentMention { agentId: string; agentName: string; start: number; end: number; }
export interface Attachment { id: string; name: string; type: string; size: number; dataUrl?: string; url?: string; }

export interface ChatMessage {
  role: ChatRole;
  content: string;
  agentId?: string;
  mentions?: AgentMention[];
  attachments?: Attachment[];
  timestamp?: number;
  /** Falha do envio, mostrada dentro da conversa. Não é enviada ao modelo. */
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  agentId?: string;
  groupId?: string;
  type?: "individual" | "group";
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  enabled: boolean;
  role?: string;
  provider?: string;
  department?: string;
  avatar?: string;
  specialties?: string[];
  toolsAllowed?: string[];
  generationConfig?: { temperature?: number; maxTokens?: number };
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  agentIds: string[];
  participantRoles?: Record<string, string>;
  coordinatorId?: string;
  mode: "manual" | "mention" | "coordinated";
  createdAt: number;
}

export interface Workspace {
  conversations: Conversation[];
  agents: Agent[];
  groups: Group[];
}

/**
 * Lista de textos vinda do armazenamento ou da API. Aceita array, string separada por vírgula ou quebra de linha,
 * e trata null/undefined/outros tipos como lista vazia. Nunca lança, para não derrubar a tela ao abrir um agente.
 */
export function toStringList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Corrige os campos de lista de um agente lido do armazenamento ou da API. Retorna null se não for um objeto. */
export function normalizeAgent(raw: unknown): Agent | null {
  if (!raw || typeof raw !== "object") return null;
  const agent = raw as Agent;
  return {
    ...agent,
    specialties: toStringList(agent.specialties),
    toolsAllowed: toStringList(agent.toolsAllowed),
  };
}

export function parseWorkspace(serialized: string | null): Workspace {
  if (!serialized) return { conversations: [], agents: [], groups: [] };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return { conversations: [], agents: [], groups: [] };
    const value = parsed as Partial<Workspace>;
    return {
      conversations: Array.isArray(value.conversations) ? value.conversations : [],
      agents: Array.isArray(value.agents) ? value.agents.map(normalizeAgent).filter((agent): agent is Agent => agent !== null) : [],
      groups: Array.isArray(value.groups) ? value.groups : [],
    };
  } catch {
    return { conversations: [], agents: [], groups: [] };
  }
}

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({ conversations: workspace.conversations, agents: workspace.agents, groups: workspace.groups });
}
