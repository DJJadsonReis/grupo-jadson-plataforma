export type AgentPermission = "owner" | "editor" | "user";

export interface AgentAccessView {
  permission?: AgentPermission;
}

/** Local-only profiles remain editable until the backend assigns a role. */
export function canEditAgent(agent: AgentAccessView): boolean {
  return agent.permission === undefined || agent.permission === "owner" || agent.permission === "editor";
}

export function canShareAgent(agent: AgentAccessView): boolean {
  return agent.permission === "owner";
}

export function visibleAgentIds<T extends { id: string }>(agents: T[], accessibleIds: Iterable<string>): T[] {
  const ids = new Set(accessibleIds);
  return agents.filter((agent) => ids.has(agent.id));
}
