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

  it("envia ferramentas ao endpoint OpenAI compatÃ­vel e preserva o evento de tool call", async () => {
    const event = { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", type: "function", function: { name: "busca__web", arguments: "{}" } }] } }] };
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "gpt-4o-mini" }))).mockResolvedValueOnce(new Response(`data: ${JSON.stringify(event)}\\n\\n`));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "teste" }));
      const tools = [{ type: "function" as const, function: {
        name: "busca__web", description: "Pesquisa", parameters: { type: "object" as const, properties: {}, additionalProperties: true as const },
      } }];
      const response = await provider.stream({ messages: [{ role: "user", content: "pesquise" }], tools });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(String(fetch.mock.calls[0]?.[0])).toContain("/models/");
      const requestBody = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as { tools: unknown[]; tool_choice: string };
      expect(requestBody.tools).toEqual(tools);
      expect(requestBody.tool_choice).toBe("auto");
      expect(await response.text()).toContain("busca__web");
    } finally {
      fetch.mockRestore();
    }
  });

  it("recusa modelo ausente na lista do provider antes do POST de chat", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404 }));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "teste" }));
      await expect(provider.stream({ model: "modelo-inexistente", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_UNAVAILABLE" }) });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { fetch.mockRestore(); }
  });

  it("falha com mensagem clara se a disponibilidade não puder ser confirmada", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "teste" }));
      await expect(provider.stream({ messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_CREDENTIAL_REJECTED" }) });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { fetch.mockRestore(); }
  });
});
