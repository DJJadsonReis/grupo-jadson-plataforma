import { describe, expect, it } from "vitest";
import { parseWorkspace, serializeWorkspace } from "./workspace";

describe("workspace serialization", () => {
  it("uses an empty workspace when local data is missing or malformed", () => {
    expect(parseWorkspace(null)).toEqual({ conversations: [], agents: [] });
    expect(parseWorkspace("not-json")).toEqual({ conversations: [], agents: [] });
  });

  it("preserves conversations and agents across a serialization round trip", () => {
    const workspace = {
      conversations: [{ id: "conversation-1", title: "Teste", messages: [{ role: "user" as const, content: "Olá" }], updatedAt: 100 }],
      agents: [{ id: "agent-1", name: "Pesquisador", description: "", instructions: "Use fontes", model: "", enabled: true }],
    };
    expect(parseWorkspace(serializeWorkspace(workspace))).toEqual(workspace);
  });

  it("keeps the optional agent link and reads older conversations without it", () => {
    const legacy = { conversations: [{ id: "conversation-old", title: "Antiga", messages: [], updatedAt: 42 }], agents: [] };
    expect(parseWorkspace(JSON.stringify(legacy))).toEqual(legacy);
    const linked = { ...legacy, conversations: [{ ...legacy.conversations[0]!, agentId: "agent-1" }] };
    expect(parseWorkspace(serializeWorkspace(linked))).toEqual(linked);
  });
});
