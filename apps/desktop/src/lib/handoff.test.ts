import { describe, expect, it } from "vitest";
import { agentesDelegaveis, delegacaoDesabilitada, rotuloDelegacao } from "./handoff";
import type { Agent } from "./workspace";

const agent = (id: string, enabled = true): Agent => ({ id, name: id, enabled, description: "", instructions: "", model: "" });

describe("handoff entre agentes", () => {
  it("oferece somente agentes ativos diferentes do atual", () => {
    expect(agentesDelegaveis([agent("a"), agent("b", false), agent("c")], "a").map((item) => item.id)).toEqual(["c"]);
  });
  it("formata a transição e o motivo opcional", () => {
    expect(rotuloDelegacao("Ana", "Beto", "Revise o plano")).toBe("Conversa passada de Ana para Beto — Revise o plano");
    expect(rotuloDelegacao("", "Beto")).toBe("Conversa passada de Assistente Geral para Beto");
  });
  it("desabilita a confirmação sem destino ou durante o envio", () => {
    expect(delegacaoDesabilitada("", false)).toBe(true);
    expect(delegacaoDesabilitada("b", true)).toBe(true);
    expect(delegacaoDesabilitada("b", false)).toBe(false);
  });
});
