import { ServiceUnavailableException } from "@nestjs/common";
import { IntegrationsService } from "../integrations/integrations.service";
import { OpenAiProvider } from "./openai.provider";

/** Integrações falsas: só o que o teste informa existe. */
function integrationsWith(values: Record<string, string | undefined>): IntegrationsService {
  return { secret: async (name: string) => values[name] } as unknown as IntegrationsService;
}

describe("OpenAiProvider", () => {
  it("informa não configurado quando não há chave nem endereço local", async () => {
    expect(await new OpenAiProvider(integrationsWith({})).isConfigured()).toBe(false);
  });

  it("considera configurado com a chave das Configurações", async () => {
    expect(await new OpenAiProvider(integrationsWith({ modelo_chave: "chave-de-teste-123" })).isConfigured()).toBe(true);
  });

  it("considera configurado um endereço local sem chave", async () => {
    expect(await new OpenAiProvider(integrationsWith({ modelo_endereco: "http://127.0.0.1:11434/v1/chat/completions" })).isConfigured()).toBe(true);
  });

  it("descobre o endereço do Google quando a chave começa com AIza e o endereço está vazio", async () => {
    const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "AIzaSyTESTE123456" })) as unknown as { settings(): Promise<{ endpoint: string; model: string }> };
    const settings = await provider.settings();
    expect(settings.endpoint).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(settings.model).toBe("gemini-2.0-flash");
  });

  it("recusa antes de qualquer requisição quando falta a chave", async () => {
    const provider = new OpenAiProvider(integrationsWith({}));
    await expect(provider.stream({ messages: [{ role: "user", content: "oi" }] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
