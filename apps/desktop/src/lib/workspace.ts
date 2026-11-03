export type ChatRole = "user" | "assistant";
export interface ChatMessage { role: ChatRole; content: string; }
export interface Conversation { id: string; title: string; messages: ChatMessage[]; updatedAt: number; agentId?: string; }
export interface Agent { id: string; name: string; description: string; instructions: string; model: string; enabled: boolean; }
export interface Workspace { conversations: Conversation[]; agents: Agent[]; }

export function parseWorkspace(serialized: string | null): Workspace {
  if (!serialized) return { conversations: [], agents: [] };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return { conversations: [], agents: [] };
    const value = parsed as Partial<Workspace>;
    return { conversations: Array.isArray(value.conversations) ? value.conversations : [], agents: Array.isArray(value.agents) ? value.agents : [] };
  } catch {
    return { conversations: [], agents: [] };
  }
}

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({ conversations: workspace.conversations, agents: workspace.agents });
}
