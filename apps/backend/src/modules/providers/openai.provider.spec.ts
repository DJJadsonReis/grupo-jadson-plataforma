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
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "sk-test" }));
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

  it("envia reasoning_effort apenas para modelos OpenAI explicitamente compatíveis", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "o3" }))).mockResolvedValueOnce(new Response("data: [DONE]\n\n"));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "sk-falso-de-teste" }));
      await provider.stream({ model: "o3", reasoningEffort: "alto", messages: [{ role: "user", content: "oi" }] });
      expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({ reasoning_effort: "high" });
      fetcher.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ id: "gpt-4.1" }))).mockResolvedValueOnce(new Response("data: [DONE]\n\n"));
      await provider.stream({ model: "gpt-4.1", reasoningEffort: "alto", messages: [{ role: "user", content: "oi" }] });
      expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).not.toHaveProperty("reasoning_effort");
    } finally { fetcher.mockRestore(); }
  });

  it("recusa modelo ausente na lista do provider antes do POST de chat", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "teste-model-unavailable", modelo_endereco: "https://unavailable.example/v1/chat/completions" }));
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

  it("checa Gemini em /models e não envia chat quando o modelo não está listado", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "outro-modelo" }] })));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "chave-gemini-a", modelo_endereco: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" }));
      await expect(provider.stream({ model: "gemini-inexistente", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_UNAVAILABLE" }) });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]?.[0])).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models");
    } finally { fetch.mockRestore(); }
  });

  it("usa o cache por cinco minutos depois de confirmar o modelo compatível", async () => {
    const fetch = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "modelo-cache-55" }] })))
      .mockResolvedValue(new Response("data: [DONE]\n\n"));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "chave-cache-unica-55", modelo_endereco: "https://cache.example/v1/chat/completions" }));
      const input = { model: "modelo-cache-55", messages: [{ role: "user" as const, content: "oi" }] };
      await provider.stream(input);
      await provider.stream(input);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(String(fetch.mock.calls[0]?.[0])).toContain("/models");
      expect(String(fetch.mock.calls[1]?.[0])).toContain("/chat/completions");
      expect(String(fetch.mock.calls[2]?.[0])).toContain("/chat/completions");
    } finally { fetch.mockRestore(); }
  });

  it("mapeia credencial inválida e falha de rede e deixa passar o status 404 de /models", async () => {
    const authFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "chave-401-55", modelo_endereco: "https://auth.example/v1/chat/completions" }));
      await expect(provider.stream({ model: "modelo-401-55", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_CREDENTIAL_REJECTED" }) });
    } finally { authFetch.mockRestore(); }

    const networkFetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sem rede"));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "chave-rede-55", modelo_endereco: "https://network.example/v1/chat/completions" }));
      await expect(provider.stream({ model: "modelo-rede-55", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: "MODEL_CHECK_FAILED" }) });
    } finally { networkFetch.mockRestore(); }

    const missingRouteFetch = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("data: [DONE]\n\n"));
    try {
      const provider = new OpenAiProvider(integrationsWith({ modelo_chave: "chave-404-55", modelo_endereco: "https://no-list.example/v1/chat/completions" }));
      await expect(provider.stream({ model: "modelo-404-55", messages: [{ role: "user", content: "oi" }] })).resolves.toBeInstanceOf(Response);
      expect(missingRouteFetch).toHaveBeenCalledTimes(2);
    } finally { missingRouteFetch.mockRestore(); }
  });
});
