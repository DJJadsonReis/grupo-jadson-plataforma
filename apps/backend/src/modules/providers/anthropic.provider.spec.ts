import { anthropicStreamToOpenAi, AnthropicProvider, translateAnthropicRequest } from "./anthropic.provider";

describe("Anthropic adapter", () => {
  it.each([["baixo", 1024], ["medio", 4096], ["alto", 8192]] as const)("maps effort %s to a valid thinking budget", (reasoningEffort, budget) => {
    const translated = translateAnthropicRequest({ model: "claude-sonnet-4-5", reasoningEffort, generationConfig: { maxTokens: 1024 }, messages: [{ role: "user", content: "oi" }] });
    expect(translated.thinking).toEqual({ type: "enabled", budget_tokens: budget });
    expect(translated.max_tokens).toBeGreaterThan(budget);
  });
  it("omits thinking for models outside the explicit support list", () => {
    const translated = translateAnthropicRequest({ model: "claude-3-5-haiku-latest", reasoningEffort: "alto", messages: [{ role: "user", content: "oi" }] });
    expect(translated).not.toHaveProperty("thinking");
  });
  it("move system para campo próprio, traduz mensagens e tool calls para tool_use/result", () => {
    const translated = translateAnthropicRequest({ model: "claude-test", messages: [
      { role: "system", content: "Siga as regras" },
      { role: "user", content: "Olá" },
      { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "busca__web", arguments: '{"q":"x"}' } }] },
      { role: "tool", tool_call_id: "call-1", content: "resultado" },
    ], tools: [{ type: "function", function: { name: "busca__web", description: "Busca", parameters: { type: "object", properties: {}, additionalProperties: true } } }] });
    expect(translated.system).toBe("Siga as regras");
    expect(translated.messages).toEqual([
      { role: "user", content: "Olá" },
      { role: "assistant", content: [{ type: "tool_use", id: "call-1", name: "busca__web", input: { q: "x" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: "resultado" }] },
    ]);
    expect(translated.tools).toEqual([{ name: "busca__web", description: "Busca", input_schema: { type: "object", properties: {}, additionalProperties: true } }]);
  });

  it("converte SSE de Anthropic em delta de texto e tool_calls no contrato OpenAI", async () => {
    const source = [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "busca__web" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":' } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"x"}' } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "feito" } },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    const converted = anthropicStreamToOpenAi(new Response(source, { headers: { "Content-Type": "text/event-stream" } }));
    const body = await converted.text();
    const events = body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).filter((line) => line !== "[DONE]").map((line) => JSON.parse(line));
    const deltas = events.map((event) => event.choices[0].delta);
    expect(deltas[0].tool_calls[0].function.name).toBe("busca__web");
    expect(deltas.filter((delta) => delta.tool_calls).map((delta) => delta.tool_calls[0].function.arguments).join("")).toBe('{"q":"x"}');
    expect(deltas.some((delta) => delta.content === "feito")).toBe(true);
    expect(body).toContain("data: [DONE]");
  });

  it("valida modelo com respostas simuladas e rejeita 404 antes do POST", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-only";
    const request = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    try {
      await expect(new AnthropicProvider().stream({ model: "claude-missing", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_UNAVAILABLE" }) });
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toContain("/models/claude-missing");
    } finally {
      request.mockRestore();
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
