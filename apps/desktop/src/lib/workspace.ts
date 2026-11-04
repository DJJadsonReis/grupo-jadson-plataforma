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

export function parseWorkspace(serialized: string | null): Workspace {
  if (!serialized) return { conversations: [], agents: [], groups: [] };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return { conversations: [], agents: [], groups: [] };
    const value = parsed as Partial<Workspace>;
    return {
      conversations: Array.isArray(value.conversations) ? value.conversations : [],
      agents: Array.isArray(value.agents) ? value.agents : [],
      groups: Array.isArray(value.groups) ? value.groups : [],
    };
  } catch {
    return { conversations: [], agents: [], groups: [] };
  }
}

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({ conversations: workspace.conversations, agents: workspace.agents, groups: workspace.groups });
}
