import { describe, expect, it, vi } from "vitest";
import { agentPayload, endpointReadOptions, protocolosEndpoint, rotuloProtocolo } from "./agent-endpoint";
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

  it("expõe os protocolos e envia a escolha no payload", () => {
    expect(protocolosEndpoint()).toEqual([
      { value: "json", label: "Simples (JSON)", dica: "Resposta inteira de uma vez." },
      { value: "agui", label: "AG-UI (streaming)", dica: "Resposta aparece enquanto é gerada." },
    ]);
    expect(rotuloProtocolo("agui")).toBe("AG-UI (streaming)");
    expect(rotuloProtocolo("desconhecido")).toBe("Simples (JSON)");
    expect(agentPayload(agent, { providerKind: "endpoint", endpointUrl: "https://agent.example/run", endpointToken: "", endpointProtocol: "agui" }).endpointProtocol).toBe("agui");
  });
});
