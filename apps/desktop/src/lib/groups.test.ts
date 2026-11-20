import { describe, expect, it } from "vitest";
import { buildGroupRequest, readGroupMentions } from "./groups";

describe("grupos de agentes", () => {
  it("monta requisição de grupo no modo menção sem agente fixo", () => {
    expect(buildGroupRequest({ mode: "mention" }, "  @Pesquisa revise  ")).toEqual({ content: "@Pesquisa revise" });
  });

  it("monta requisição de grupo manual com o agente escolhido", () => {
    expect(buildGroupRequest({ mode: "manual" }, "olá", "agente-1")).toEqual({ content: "olá", agentId: "agente-1" });
  });

  it("não monta requisição para texto vazio nem agente manual ausente", () => {
    expect(buildGroupRequest({ mode: "mention" }, "  ")).toBeNull();
    expect(buildGroupRequest({ mode: "manual" }, "olá")).toBeNull();
  });

  it("lê nome e posição das menções", () => {
    expect(readGroupMentions("Oi @Pesquisa, veja isto", [{ id: "a1", name: "Pesquisa" }])).toEqual([
      { agentId: "a1", agentName: "Pesquisa", start: 3, end: 12 },
    ]);
  });
});
