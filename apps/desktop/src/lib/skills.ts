export type SkillRecord = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  global: boolean;
  tools: string[];
  createdAt: string;
  updatedAt: string;
};

export type ToolInfo = { name: string; description: string; risk?: string };
export type AgentInfo = { id: string; name: string };
export type SkillCreateBody = { slug: string; title: string; summary: string; instructions: string; tools: string[]; global?: true };

export function validateSlug(value: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(value) ? null : "Slug inválido.";
}

export function validateTitle(value: string): string | null {
  if (!value.trim() || value.length > 300) return "Título inválido.";
  return null;
}

export function validateInstructions(value: string): string | null {
  if (!value.trim() || value.length > 20_000) return "Instruções inválidas.";
  return null;
}

export function buildCreateBody(slug: string, title: string, summary: string, instructions: string, tools: string[] = [], isAdmin = false, createGlobal = false): SkillCreateBody {
  const body: SkillCreateBody = { slug, title, summary, instructions, tools: [...new Set(tools)] };
  if (isAdmin && createGlobal) body.global = true;
  return body;
}

export function toggleTool(selected: string[], name: string, checked: boolean): string[] {
  return checked ? [...new Set([...selected, name])] : selected.filter((tool) => tool !== name);
}

export function canDeleteSkill(skill: Pick<SkillRecord, "global">, isAdmin: boolean): boolean {
  return !skill.global || isAdmin;
}

export function canCreateGlobal(isAdmin: boolean): boolean {
  return isAdmin;
}

export function agentSkillsUrl(apiUrl: string, agentId: string): string {
  return `${apiUrl}/agents/${encodeURIComponent(agentId)}/skills`;
}

export function agentSkillUrl(apiUrl: string, agentId: string, slug: string): string {
  return `${agentSkillsUrl(apiUrl, agentId)}/${encodeURIComponent(slug)}`;
}

export function readErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") return body.message;
  return fallback;
}
