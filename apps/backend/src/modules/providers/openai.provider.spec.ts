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

  it("recusa antes de qualquer requisição quando falta a chave", async () => {
    const provider = new OpenAiProvider(integrationsWith({}));
    await expect(provider.stream({ messages: [{ role: "user", content: "oi" }] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
