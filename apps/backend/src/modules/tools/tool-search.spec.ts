import { TOOL_DEFINITIONS, ToolDefinition } from "./tools.registry";
import { FOUND_LIMIT, SEARCH_RESULTS, SEARCH_TOOL_NAME, TOOL_SEARCH_FLOOR, foundFrom, searchEnabled, searchTools, visibleTools } from "./tool-search";

function mcpTools(count: number): ToolDefinition[] {
  return Array.from({ length: count }, (_, index) => ({ name: `mcp.ferramenta_${index}`, description: `Ferramenta de leitura ${index}`, risk: "read" as const }));
}

describe("tool-search", () => {
  it("mantém todas as ferramentas até o limite e ativa a busca acima dele", () => {
    expect(TOOL_SEARCH_FLOOR).toBe(50);
    const coreRead = TOOL_DEFINITIONS.filter((definition) => definition.risk === "read");
    const atLimit = [...coreRead, ...mcpTools(50 - coreRead.length)];
    const overLimit = [...atLimit, ...mcpTools(1)];
    expect(atLimit.filter((definition) => definition.risk === "read")).toHaveLength(50);
    expect(searchEnabled(atLimit)).toBe(false);
    expect(searchEnabled(overLimit)).toBe(true);
    expect(visibleTools(atLimit, new Set())).toEqual(atLimit.filter((definition) => definition.risk === "read"));
    const visible = visibleTools(overLimit, new Set());
    expect(visible.at(-1)?.name).toBe(SEARCH_TOOL_NAME);
    expect(visible.some((definition) => definition.name === "mcp.ferramenta_0")).toBe(false);
  });

  it("preserva as ferramentas núcleo e mostra descobertas, limitadas às vinte mais recentes", () => {
    const defs = [...TOOL_DEFINITIONS, ...mcpTools(25)];
    const coreRead = TOOL_DEFINITIONS.filter((definition) => definition.risk === "read");
    const found = new Set(mcpTools(25).map((definition) => definition.name));
    const visible = visibleTools(defs, found);
    expect(visible.slice(0, coreRead.length)).toEqual(coreRead);
    expect(visible.filter((definition) => definition.name.startsWith("mcp."))).toHaveLength(25);
    expect(visible.some((definition) => definition.name === "mcp.ferramenta_4")).toBe(true);
    expect(visible.some((definition) => definition.name === "mcp.ferramenta_24")).toBe(true);
    expect(visible.filter((definition) => definition.name.startsWith("mcp."))[0]?.name).toBe("mcp.ferramenta_0");
    expect(visible.filter((definition) => definition.name.startsWith("mcp.")).at(-1)?.name).toBe("mcp.ferramenta_24");
  });

  it("busca por nome e descrição e retorna resultados ordenados", () => {
    const defs: ToolDefinition[] = [
      { name: "mcp.z_arquivos", description: "Lê documento", risk: "read" },
      { name: "mcp.a", description: "Lista arquivos", risk: "read" },
    ];
    expect(searchTools("lista arquivos", defs)).toEqual([
      { name: "mcp.a", description: "Lista arquivos" },
      { name: "mcp.z_arquivos", description: "Lê documento" },
    ]);
    expect(searchTools("", defs)).toEqual([]);
    expect(searchTools("a x", defs)).toEqual([]);
    expect(searchTools("inexistente", defs)).toEqual([]);
  });

  it("encontra a ferramenta de leitura do Notion pelo nome e descrição", () => {
    expect(searchTools("notion.ler_pagina", TOOL_DEFINITIONS).map((item) => item.name)).toContain("notion.ler_pagina");
    expect(searchTools("lê o título texto blocos página notion", TOOL_DEFINITIONS).map((item) => item.name)).toContain("notion.ler_pagina");
  });

  it("encontra subagente por nome e descrição", () => {
    expect(searchTools("subagente", TOOL_DEFINITIONS).map((item) => item.name)).toContain("subagente.delegar");
    expect(searchTools("delegar", TOOL_DEFINITIONS).map((item) => item.name)).toContain("subagente.delegar");
  });

  it("ignora sensíveis e limita resultados a oito mesmo com limite maior", () => {
    const defs: ToolDefinition[] = [
      { name: "perigosa", description: "Arquivos", risk: "sensitive" },
      ...mcpTools(12).map((definition) => ({ ...definition, description: "Arquivos e leitura" })),
    ];
    expect(searchTools("perigosa arquivos", defs).some((result) => result.name === "perigosa")).toBe(false);
    expect(searchTools("arquivos", defs)).toHaveLength(SEARCH_RESULTS);
    expect(searchTools("arquivos", defs, 100)).toHaveLength(SEARCH_RESULTS);
  });

  it("extrai os nomes dos resultados", () => {
    expect(foundFrom([{ name: "mcp.a" }])).toEqual(["mcp.a"]);
  });
});
