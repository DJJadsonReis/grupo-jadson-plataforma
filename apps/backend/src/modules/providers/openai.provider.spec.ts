import { ServiceUnavailableException } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";

describe("OpenAiProvider configuration", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("reports the provider as unconfigured when no key exists", () => {
    delete process.env.OPENAI_API_KEY;
    expect(new OpenAiProvider().isConfigured()).toBe(false);
  });

  it("returns a configuration error before any network request", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAiProvider();
    await expect(provider.stream({ messages: [{ role: "user", content: "hello" }] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("sends image content and the persisted generation settings to the selected OpenAI model", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue(new Response("data: [DONE]\n\n", { status: 200 }));
    global.fetch = fetchMock;
    try {
      await new OpenAiProvider().stream({ model: "gpt-4o-mini", generationConfig: { temperature: 0.2, maxTokens: 512 }, messages: [{
        role: "user", content: [{ type: "text", text: "Descreva" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "auto" } }]
      }] });
      const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; temperature: number; max_tokens: number; messages: { content: unknown }[] };
      expect(request).toMatchObject({ model: "gpt-4o-mini", temperature: 0.2, max_tokens: 512 });
      expect(request.messages[0]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image_url" })]));
    } finally { global.fetch = originalFetch; }
  });
});
