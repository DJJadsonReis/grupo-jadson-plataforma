import { BadRequestException } from "@nestjs/common";
import { callAgentEndpoint, validateAgentEndpoint } from "./agent-endpoint";

describe("agent endpoint", () => {
  it.each(["http://example.com", "https://user:pass@example.com", `https://${"a".repeat(500)}.com`])("rejeita endpoint inválido %s", (url) => {
    expect(() => validateAgentEndpoint(url)).toThrow(BadRequestException);
  });

  it("envia JSON e bearer token e lê reply", async () => {
    const fetcher = jest.fn(async (_url: string, _init: unknown) => new Response(JSON.stringify({ reply: "olá" }), { status: 200 }));
    const reply = await callAgentEndpoint({
      url: "https://agent.example/run", token: "segredo", conversationId: "conv-1",
      messages: [{ role: "user", content: "oi" }], agent: { id: "a1", name: "Meu agente" },
      lookupHost: async () => ["93.184.216.34"], fetcher: fetcher as never,
    });
    expect(reply).toBe("olá");
    const init = fetcher.mock.calls[0]?.[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body)).toMatchObject({ conversationId: "conv-1", agent: { name: "Meu agente" }, messages: [{ content: "oi" }] });
  });

  it.each([500, 200])("transforma status e JSON/resposta inválida em erro genérico", async (status) => {
    const fetcher = jest.fn(async () => new Response(status === 500 ? "erro" : JSON.stringify({ reply: " " }), { status }));
    await expect(callAgentEndpoint({ url: "https://agent.example/run", messages: [], agent: { id: "a", name: "Bot" }, lookupHost: async () => ["93.184.216.34"], fetcher: fetcher as never })).rejects.toThrow("Não foi possível obter");
  });
});
