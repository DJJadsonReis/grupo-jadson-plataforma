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

export type SkillCreateBody = { slug: string; title: string; summary: string; instructions: string; tools: string[] };

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

export function buildCreateBody(slug: string, title: string, summary: string, instructions: string): SkillCreateBody {
  return { slug, title, summary, instructions, tools: [] };
}

export function readErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") return body.message;
  return fallback;
}
