import { TOOL_DEFINITIONS, ToolDefinition } from "./tools.registry";

export const TOOL_SEARCH_FLOOR = 50;
export const SEARCH_TOOL_NAME = "ferramentas.buscar";
export const FOUND_LIMIT = 20;
export const SEARCH_RESULTS = 8;

export const searchToolDefinition: ToolDefinition = {
  name: SEARCH_TOOL_NAME,
  description: "Procura ferramentas disponíveis pelo nome ou pelo que fazem. Use antes de dizer que não há ferramenta para algo.",
  risk: "read",
  parameters: {
    properties: { consulta: { type: "string", description: "Palavras sobre o que se quer fazer." } },
    required: ["consulta"],
  },
};

export function readToolsOf(defs: readonly ToolDefinition[]): ToolDefinition[] {
  return defs.filter((definition) => definition.risk === "read");
}

export function searchEnabled(defs: readonly ToolDefinition[]): boolean {
  return readToolsOf(defs).length > TOOL_SEARCH_FLOOR;
}

export function visibleTools(defs: readonly ToolDefinition[], found: ReadonlySet<string>): ToolDefinition[] {
  const readTools = readToolsOf(defs);
  if (!searchEnabled(defs)) return readTools;

  const coreNames = new Set(readToolsOf(TOOL_DEFINITIONS).map((definition) => definition.name));
  const byName = new Map(readTools.map((definition) => [definition.name, definition]));
  const core = readTools.filter((definition) => coreNames.has(definition.name));
  const discovered = [...found]
    .slice(-FOUND_LIMIT)
    .filter((name) => !coreNames.has(name))
    .map((name) => byName.get(name))
    .filter((definition): definition is ToolDefinition => definition !== undefined);
  return [...core, ...discovered, searchToolDefinition];
}

function tokens(text: string): string[] {
  return text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
}

export function searchTools(consulta: string, defs: readonly ToolDefinition[], limit = SEARCH_RESULTS): { name: string; description: string }[] {
  const queryTokens = tokens(consulta);
  if (!queryTokens.length) return [];
  return readToolsOf(defs)
    .map((definition) => ({
      name: definition.name,
      description: definition.description,
      score: queryTokens.filter((token) => `${definition.name} ${definition.description}`.toLocaleLowerCase().includes(token)).length,
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.min(Math.max(0, Math.floor(limit)), SEARCH_RESULTS))
    .map(({ name, description }) => ({ name, description }));
}

export function foundFrom(results: readonly { name: string }[]): string[] {
  return results.map(({ name }) => name);
}
