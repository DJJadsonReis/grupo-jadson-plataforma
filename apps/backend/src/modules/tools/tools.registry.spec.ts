import { findTool, TOOL_DEFINITIONS } from "./tools.registry";

describe("registro de ferramentas", () => {
  it("nomes são únicos", () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("toda ferramenta tem risco declarado", () => {
    for (const tool of TOOL_DEFINITIONS) expect(["read", "sensitive"]).toContain(tool.risk);
  });

  it("a ferramenta que apaga dados é sensível", () => {
    expect(findTool("memoria.apagar_tudo")?.risk).toBe("sensitive");
  });

  it("ferramenta desconhecida não existe", () => {
    expect(findTool("shell.executar")).toBeUndefined();
  });
});
