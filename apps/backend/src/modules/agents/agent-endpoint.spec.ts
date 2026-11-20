import { BadRequestException } from "@nestjs/common";
import { callAgentEndpoint, streamAgUiEndpoint, validateAgentEndpoint } from "./agent-endpoint";

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

describe("AG-UI endpoint", () => {
  const input = (sse: string, options: { headers?: Record<string, string>; status?: number; lookup?: string[]; idleTimeoutMs?: number } = {}) => ({
    url: "https://agent.example/run", messages: [{ role: "user", content: "oi" }], agent: { id: "a", name: "Bot" },
    lookupHost: async () => options.lookup ?? ["93.184.216.34"], idleTimeoutMs: options.idleTimeoutMs ?? 100,
    fetcher: (async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(sse)); controller.close(); } }), { status: options.status ?? 200, headers: { "content-type": "text/event-stream", ...options.headers } })) as never,
  });
  const event = (type: string, extra = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
  it("reconstrói quadros quebrados no meio da linha e ignora eventos desconhecidos", async () => {
    const source = `event: OTHER\ndata: {}\n\n${event("TEXT_MESSAGE_CONTENT", { delta: "Olá" })}${event("TEXT_MESSAGE_CONTENT", { delta: " mundo" })}${event("RUN_FINISHED")}`;
    const bytes = new TextEncoder().encode(source);
    const args = input("");
    args.fetcher = (async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 31)); controller.enqueue(bytes.slice(31, 68)); controller.enqueue(bytes.slice(68)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } })) as never;
    const received: string[] = []; for await (const delta of streamAgUiEndpoint(args)) received.push(delta);
    expect(received.join("")).toBe("Olá mundo");
  });
  it("falha em RUN_ERROR e quando RUN_FINISHED não chega", async () => {
    await expect(async () => { for await (const _ of streamAgUiEndpoint(input(event("RUN_ERROR")))) void _; }).rejects.toThrow("Não foi possível obter");
    await expect(async () => { for await (const _ of streamAgUiEndpoint(input(event("TEXT_MESSAGE_CONTENT", { delta: "x" })))) void _; }).rejects.toThrow("Não foi possível obter");
  });
  it("recusa destino privado e redirecionamento", async () => {
    await expect(async () => { for await (const _ of streamAgUiEndpoint(input(event("RUN_FINISHED"), { lookup: ["127.0.0.1"] }))) void _; }).rejects.toThrow();
    await expect(async () => { for await (const _ of streamAgUiEndpoint(input("", { status: 302 }))) void _; }).rejects.toThrow();
  });
  it("cancela resposta acima de 256 KB e stream silencioso", async () => {
    const oversized = event("TEXT_MESSAGE_CONTENT", { delta: "x".repeat(256 * 1024 + 1) }) + event("RUN_FINISHED");
    await expect(async () => { for await (const _ of streamAgUiEndpoint(input(oversized))) void _; }).rejects.toThrow();
    const silent = input("");
    silent.idleTimeoutMs = 10;
    silent.fetcher = (async () => new Response(new ReadableStream({ start() { /* Mantém o fluxo aberto para testar o limite de silêncio. */ } }), { headers: { "content-type": "text/event-stream" } })) as never;
    await expect(async () => { for await (const _ of streamAgUiEndpoint(silent)) void _; }).rejects.toThrow();
  });
});
