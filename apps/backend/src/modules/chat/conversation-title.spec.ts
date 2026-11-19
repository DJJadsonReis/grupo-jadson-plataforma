import { generateConversationTitle } from "./conversation-title";

function stream(events: unknown[], status = 200) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return Promise.resolve(new Response(body, { status, headers: { "Content-Type": "text/event-stream" } }));
}

describe("título automático de conversa", () => {
  it("usa o provedor configurado com chamada curta e sem ferramentas", async () => {
    const provider = jest.fn(async (input) => stream([{ choices: [{ delta: { content: '"Resumo do projeto"' } }] }]));
    await expect(generateConversationTitle(provider, "modelo-escolhido", "pergunta", "resposta")).resolves.toBe("Resumo do projeto");
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ model: "modelo-escolhido", generationConfig: { temperature: 0.2, maxTokens: 48 }, messages: expect.any(Array) }));
    expect(provider.mock.calls[0]?.[0]).not.toHaveProperty("tools");
  });

  it("retorna fallback em falha HTTP, fluxo ausente ou resposta vazia", async () => {
    await expect(generateConversationTitle(async () => new Response("falha", { status: 503 }), undefined, "pergunta", "resposta")).resolves.toBeNull();
    await expect(generateConversationTitle(async () => { throw new Error("indisponível"); }, undefined, "pergunta", "resposta")).resolves.toBeNull();
    await expect(generateConversationTitle(async () => stream([]), undefined, "pergunta", "resposta")).resolves.toBeNull();
  });
});
