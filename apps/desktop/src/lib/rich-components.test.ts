import { describe, expect, it } from "vitest";
import { splitRichComponents, validateRichComponent } from "./rich-components";

describe("validateRichComponent", () => {
  it("aceita cartão, tabela e barras", () => {
    expect(validateRichComponent('{"tipo":"cartao","titulo":"Resumo","corpo":"Tudo certo"}')?.tipo).toBe("cartao");
    expect(validateRichComponent('{"tipo":"tabela","colunas":["A"],"linhas":[["B"]]}')?.tipo).toBe("tabela");
    expect(validateRichComponent('{"tipo":"barras","itens":[{"rotulo":"A","valor":0}]}')?.tipo).toBe("barras");
  });
  it("recusa JSON e payloads inválidos ou fora dos limites", () => {
    for (const raw of ["{", '{"tipo":"outro"}', '{"tipo":"cartao","corpo":"x"}', '{"tipo":"tabela","colunas":["A"],"linhas":[["A","B"]]}', '{"tipo":"barras","itens":[{"rotulo":"A","valor":-1}]}', '{"tipo":"barras","itens":[{"rotulo":"A","valor":1e999}]}', JSON.stringify({ tipo: "barras", itens: Array.from({ length: 13 }, (_, i) => ({ rotulo: String(i), valor: i })) }), JSON.stringify({ tipo: "tabela", colunas: ["A"], linhas: Array.from({ length: 51 }, () => ["x"]) })]) expect(validateRichComponent(raw)).toBeNull();
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
