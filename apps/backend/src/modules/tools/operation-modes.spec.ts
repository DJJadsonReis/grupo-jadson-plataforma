import { decisionForOperationMode, OPERATION_MODES, ToolCategory } from "./operation-modes";

describe("tabela de decisão dos modos de operação", () => {
  const categories: ToolCategory[] = ["leitura", "escrita_arquivo", "rede", "envio"];
  it("avalia os cinco modos nas quatro categorias acordadas", () => {
    const expected = [
      ["run", "run", "run", "approve"],
      ["run", "approve", "approve", "approve"],
      ["run", "run", "approve", "approve"],
      ["run", "block", "block", "block"],
      ["run", "run", "run", "run"],
    ];
    OPERATION_MODES.forEach((mode, row) => categories.forEach((category, column) => {
      expect(decisionForOperationMode(mode, category)).toBe(expected[row]![column]);
    }));
  });
  it("deny prevalece sobre Ignorar permissões e allow respeita Planejamento", () => {
    expect(decisionForOperationMode("ignorar_permissoes", "sensivel", "deny")).toBe("block");
    expect(decisionForOperationMode("automatico", "envio", "allow")).toBe("run");
    expect(decisionForOperationMode("planejamento", "escrita_arquivo", "allow")).toBe("block");
  });
  it("ask explícito continua pedindo aprovação mesmo em Ignorar permissões", () => {
    expect(decisionForOperationMode("ignorar_permissoes", "escrita_documento", "ask")).toBe("approve");
  });
});
