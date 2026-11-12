import { describe, expect, it } from "vitest";
import { normalizeAgent, parseWorkspace, serializeWorkspace, toStringList } from "./workspace";

describe("workspace serialization", () => {
  it("uses an empty workspace when local data is missing or malformed", () => {
    expect(parseWorkspace(null)).toEqual({ conversations: [], agents: [], groups: [] });
    expect(parseWorkspace("not-json")).toEqual({ conversations: [], agents: [], groups: [] });
  });

  it("preserves conversations and agents across a serialization round trip", () => {
    const workspace = {
      conversations: [{ id: "conversation-1", title: "Teste", messages: [{ role: "user" as const, content: "Olá" }], updatedAt: 100 }],
      agents: [{ id: "agent-1", name: "Pesquisador", description: "", instructions: "Use fontes", model: "", enabled: true, specialties: [], toolsAllowed: [] }],
      groups: [],
    };
    expect(parseWorkspace(serializeWorkspace(workspace))).toEqual(workspace);
  });

  it("keeps the optional agent link and reads older conversations without it", () => {
    const legacy = { conversations: [{ id: "conversation-old", title: "Antiga", messages: [], updatedAt: 42 }], agents: [] };
    expect(parseWorkspace(JSON.stringify(legacy))).toEqual({ ...legacy, groups: [] });
    const linked = { ...legacy, groups: [], conversations: [{ ...legacy.conversations[0]!, agentId: "agent-1" }] };
    expect(parseWorkspace(serializeWorkspace(linked))).toEqual(linked);
  });
});

describe("lista de especialidades do agente", () => {
  it("separa string por vírgula e quebra de linha", () => {
    expect(toStringList("TypeScript, UX\npesquisa ,, ")).toEqual(["TypeScript", "UX", "pesquisa"]);
  });

  it("mantém arrays e remove itens que não são texto", () => {
    expect(toStringList([" React ", 3, "", "Node"])).toEqual(["React", "Node"]);
  });

  it("trata undefined, null e objetos como lista vazia", () => {
    expect(toStringList(undefined)).toEqual([]);
    expect(toStringList(null)).toEqual([]);
    expect(toStringList({ 0: "x" })).toEqual([]);
  });

  it("normaliza specialties e toolsAllowed de um agente salvo com string", () => {
    const agent = normalizeAgent({ id: "a1", name: "Jadxu", specialties: "design, UX", toolsAllowed: undefined });
    expect(agent?.specialties).toEqual(["design", "UX"]);
    expect(agent?.toolsAllowed).toEqual([]);
  });

  it("corrige o workspace local que tem specialties como string ou ausente", () => {
    const raw = JSON.stringify({ conversations: [], groups: [], agents: [
      { id: "a1", name: "Jadxu", description: "", instructions: "", model: "", enabled: true, specialties: "x\ny" },
      { id: "a2", name: "Sem lista", description: "", instructions: "", model: "", enabled: true },
    ] });
    const agents = parseWorkspace(raw).agents;
    expect(agents[0]?.specialties).toEqual(["x", "y"]);
    expect(agents[1]?.specialties).toEqual([]);
  });

  it("descarta entradas de agente que não são objetos", () => {
    expect(parseWorkspace(JSON.stringify({ agents: [null, "lixo", { id: "a", name: "A", specialties: null }] })).agents).toHaveLength(1);
  });
});
