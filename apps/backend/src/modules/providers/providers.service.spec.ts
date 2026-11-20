import { AnthropicProvider } from "./anthropic.provider";
import { IntegrationsService } from "../integrations/integrations.service";
import { OpenAiProvider } from "./openai.provider";
import { ProvidersService } from "./providers.service";

describe("ProvidersService.catalogue", () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  });

  it("expõe quatro provedores, reconhece chave, Gemini inferido e endpoint local sem chave", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const values: Record<string, string | undefined> = { modelo_chave: "AIza-chave-salva" };
    const integrations = { secret: async (name: string) => values[name] } as unknown as IntegrationsService;
    const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, integrations);
    const result = await service.catalogue();
    expect(result.map(({ id, configured }) => [id, configured])).toEqual([
      ["openai", false], ["anthropic", false], ["gemini", true], ["endpoint", false],
    ]);
    expect(result).toHaveLength(4);
    expect(result.every((provider) => provider.defaultModel === null || provider.models.some((model) => model.id === provider.defaultModel))).toBe(true);

    values.modelo_chave = undefined;
    values.modelo_endereco = "http://localhost:11434/v1/chat/completions";
    const local = await service.catalogue();
    expect(local.find((provider) => provider.id === "endpoint")?.configured).toBe(true);
  });
});

describe("ProvidersService managed reasoning effort", () => {
  it.each([
    ["openai", "o3", { reasoning_effort: "high" }],
    ["xai", "grok-3-mini", { reasoning_effort: "high" }],
    ["gemini", "gemini-2.5-pro", { thinkingConfig: { thinkingBudget: 8192 } }],
    ["xai", "grok-unknown", {}],
    ["custom", "custom-model", {}],
  ])("maps supported effort for %s / %s", async (kind, model, expected) => {
    const fetcher = jest.fn(async (_input: string, _init?: RequestInit) => new Response("data: [DONE]\n\n"));
    const modelProviders = {
      forChat: async () => ({ kind, baseUrl: "https://provider.example/v1", apiKey: "fake-test-key" }),
      assertAvailable: async () => undefined,
      kindForChat: async () => kind,
    };
    const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, {} as IntegrationsService, modelProviders as never);
    service.setTestDependencies(fetcher as never, async () => ["93.184.216.34"]);
    await service.stream({ providerId: "provider-id", model, reasoningEffort: "alto", messages: [{ role: "user", content: "oi" }] });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject(expected);
    if (!Object.keys(expected).length) {
      expect(body).not.toHaveProperty("reasoning_effort");
      expect(body).not.toHaveProperty("thinkingConfig");
    }
  });
});
