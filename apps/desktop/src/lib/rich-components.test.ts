import { describe, expect, it } from "vitest";
import { splitRichComponents, validateRichComponent } from "./rich-components";
import { RICH_COMPONENTS_EXAMPLES } from "./rich-components-examples";

describe("validateRichComponent", () => {
  it("aceita cartão, tabela e barras", () => {
    expect(validateRichComponent('{"tipo":"cartao","titulo":"Resumo","corpo":"Tudo certo"}')?.tipo).toBe("cartao");
    expect(validateRichComponent('{"tipo":"tabela","colunas":["A"],"linhas":[["B"]]}')?.tipo).toBe("tabela");
    expect(validateRichComponent('{"tipo":"barras","itens":[{"rotulo":"A","valor":0}]}')?.tipo).toBe("barras");
  });
  it("recusa JSON e payloads inválidos ou fora dos limites", () => {
    for (const raw of ["{", '{"tipo":"outro"}', '{"tipo":"cartao","corpo":"x"}', '{"tipo":"tabela","colunas":["A"],"linhas":[["A","B"]]}', '{"tipo":"barras","itens":[{"rotulo":"A","valor":-1}]}', '{"tipo":"barras","itens":[{"rotulo":"A","valor":1e999}]}', JSON.stringify({ tipo: "barras", itens: Array.from({ length: 13 }, (_, i) => ({ rotulo: String(i), valor: i })) }), JSON.stringify({ tipo: "tabela", colunas: ["A"], linhas: Array.from({ length: 51 }, () => ["x"]) })]) expect(validateRichComponent(raw)).toBeNull();
  });
  it("aceita gráficos válidos e preserva o texto dos gráficos recusados", () => {
    const line = { tipo: "grafico", formato: "linha", rotulos: ["Jan"], series: [{ nome: "Vendas", valores: [3] }] };
    const pie = { tipo: "grafico", formato: "pizza", rotulos: ["A", "B"], series: [{ nome: "Partes", valores: [3, 1] }] };
    expect(validateRichComponent(JSON.stringify(line))?.tipo).toBe("grafico");
    expect(validateRichComponent(JSON.stringify(pie))?.tipo).toBe("grafico");
    const invalid = [
      { ...line, series: [{ nome: "Vazia", valores: [] }] },
      { ...pie, series: [{ nome: "A", valores: [1, 1] }, { nome: "B", valores: [1, 1] }] },
      { ...pie, series: [{ nome: "Zero", valores: [0, 0] }] },
      { ...line, series: [{ nome: "Negativa", valores: [-1] }] },
      { tipo: "grafico", formato: "linha", rotulos: Array.from({ length: 13 }, () => "x"), series: [{ nome: "S", valores: Array(13).fill(1) }] },
      "{",
    ];
    for (const payload of invalid) {
      const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
      expect(validateRichComponent(raw)).toBeNull();
      const block = `\`\`\`componente\n${raw}\n\`\`\``;
      expect(splitRichComponents(block)).toEqual([{ kind: "text", text: block }]);
    }
  });
  it("valida todos os exemplos apresentados na galeria", () => {
    for (const example of RICH_COMPONENTS_EXAMPLES) expect(validateRichComponent(JSON.stringify(example.component))).toEqual(example.component);
    expect(RICH_COMPONENTS_EXAMPLES.map((example) => example.tipo)).toEqual(["cartao", "tabela", "barras", "grafico", "grafico"]);
  });
});

describe("splitRichComponents", () => {
  it("preserva ordem, texto sem bloco e bloco inválido", () => {
    const card = '```componente\n{"tipo":"cartao","titulo":"T","corpo":"C"}\n```';
    expect(splitRichComponents(`antes ${card} depois`)).toEqual([
      { kind: "text", text: "antes " }, { kind: "component", component: { tipo: "cartao", titulo: "T", corpo: "C" } }, { kind: "text", text: " depois" },
    ]);
    expect(splitRichComponents("sem bloco")).toEqual([{ kind: "text", text: "sem bloco" }]);
    expect(splitRichComponents("```componente\n{}\n```" )).toEqual([{ kind: "text", text: "```componente\n{}\n```" }]);
  });
});
