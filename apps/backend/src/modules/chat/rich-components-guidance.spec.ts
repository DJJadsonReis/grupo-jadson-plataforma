import { RICH_COMPONENTS_GUIDANCE } from "./rich-components-guidance";

describe("orientação de componentes ricos", () => {
  it("documenta o formato cercado e os três tipos", () => {
    expect(RICH_COMPONENTS_GUIDANCE).toContain("```componente");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("cartao");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("tabela");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("barras");
  });
});
