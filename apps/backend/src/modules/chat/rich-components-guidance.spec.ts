import { RICH_COMPONENTS_GUIDANCE } from "./rich-components-guidance";

describe("orientação de componentes ricos", () => {
  it("documenta o formato cercado, os tipos e limites de gráficos", () => {
    expect(RICH_COMPONENTS_GUIDANCE).toContain("```componente");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("cartao");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("tabela");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("barras");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("grafico");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("linha");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("pizza");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("1 a 6 séries");
    expect(RICH_COMPONENTS_GUIDANCE).toContain("1 a 12 textos de até 60 caracteres");
  });
});
