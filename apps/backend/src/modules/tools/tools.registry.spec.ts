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

  it("registra leitura do Notion como read e anexo como sensitive", () => {
    expect(findTool("notion.ler_pagina")?.risk).toBe("read");
    expect(findTool("notion.anexar_texto")?.risk).toBe("sensitive");
    expect(findTool("notion.ler_pagina")?.parameters?.required).toEqual(["pagina"]);
    expect(findTool("notion.anexar_texto")?.parameters?.required).toEqual(["pagina", "texto"]);
  });

  it("registra delegação de subagente como leitura com tarefa obrigatória", () => {
    expect(findTool("subagente.delegar")).toMatchObject({ risk: "read", parameters: { required: ["tarefa"] } });
  });

  it("ferramenta desconhecida não existe", () => {
    expect(findTool("shell.executar")).toBeUndefined();
  });
});
