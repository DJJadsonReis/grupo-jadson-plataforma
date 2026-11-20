import { describe, expect, it, vi } from "vitest";
import { agentPayload, endpointReadOptions } from "./agent-endpoint";
import type { Agent } from "./workspace";

const agent: Agent = { id: "id", name: "Bot", description: "", instructions: "", model: "x", enabled: true, endpointUrl: "https://agent.example", hasEndpointToken: true };

describe("agent endpoint form helper", () => {
  it("bloqueia URL inválida antes de enviar", () => {
    const fetcher = vi.fn();
    expect(() => { const payload = agentPayload(agent, { providerKind: "endpoint", endpointUrl: "http://agent.example", endpointToken: "secret" }); fetcher(payload); }).toThrow("HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("só envia token em escrita e nunca inclui token no GET", () => {
    const payload = agentPayload(agent, { providerKind: "endpoint", endpointUrl: "https://agent.example/run", endpointToken: "secret" });
    expect(payload.endpointToken).toBe("secret");
    expect(endpointReadOptions()).toEqual({ method: "GET" });
    expect(JSON.stringify(endpointReadOptions())).not.toContain("secret");
  });
});
