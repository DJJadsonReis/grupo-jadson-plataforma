import { ModelProvidersService } from "./model-providers.service";
import { ProvidersService } from "./providers.service";
import { OpenAiProvider } from "./openai.provider";
import { AnthropicProvider } from "./anthropic.provider";
import { IntegrationsService } from "../integrations/integrations.service";

describe("managed model provider routing", () => {
  it("routes only to the selected custom provider and uses its key", async () => {
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("WHERE id=$1")) return { rows: [{ id: values[0], kind: "custom", name: "Custom falso", baseUrl: "https://provedor.invalid/v1", secretCiphertext: "fake-encrypted-secret", models: [{ id: "modelo-custom-falso", label: "Modelo custom" }], enabled: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const managed = new ModelProvidersService({ getPool: () => ({ query }) } as never);
    (managed as any).box = { decrypt: () => "sk-teste-falso-custom" };
    const integrations = {} as IntegrationsService;
    const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, integrations, managed);
    const request = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("data: [DONE]\n\n", { status: 200 }));
    try {
      const response = await service.stream({ providerId: "123e4567-e89b-42d3-a456-426614174010", model: "modelo-custom-falso", messages: [{ role: "user", content: "oi" }] });
      expect(response.status).toBe(200);
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toBe("https://provedor.invalid/v1/chat/completions");
      expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer sk-teste-falso-custom" });
      expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).model).toBe("modelo-custom-falso");
    } finally { request.mockRestore(); }
  });
});
