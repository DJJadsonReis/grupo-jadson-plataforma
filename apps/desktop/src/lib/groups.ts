import type { Agent, Group } from "./workspace";

export interface GroupMention {
  agentId: string;
  agentName: string;
  start: number;
  end: number;
}

export function readGroupMentions(text: string, agents: Pick<Agent, "id" | "name">[]): GroupMention[] {
  const mentions: GroupMention[] = [];
  for (const agent of agents) {
    const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      mentions.push({ agentId: agent.id, agentName: agent.name, start, end: start + match[0].length });
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}

export function buildGroupRequest(group: Pick<Group, "mode">, text: string, requestedAgentId?: string): { content: string; agentId?: string } | null {
  const content = text.trim();
  if (!content) return null;
  if (group.mode === "manual") {
    if (!requestedAgentId) return null;
    return { content, agentId: requestedAgentId };
  }
  return { content };
}
