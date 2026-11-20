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
