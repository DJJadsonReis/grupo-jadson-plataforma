import { ModelProvidersService } from "./model-providers.service";
import { ProvidersService } from "./providers.service";
import { OpenAiProvider } from "./openai.provider";
import { AnthropicProvider } from "./anthropic.provider";
import { IntegrationsService } from "../integrations/integrations.service";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

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
    const request = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("data: [DONE]\n\n", { status: 200 }));
    service.setTestDependencies(request as typeof fetch, async () => ["8.8.8.8"]);
    {
      const response = await service.stream({ providerId: "123e4567-e89b-42d3-a456-426614174010", model: "modelo-custom-falso", messages: [{ role: "user", content: "oi" }] });
      expect(response.status).toBe(200);
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toBe("https://provedor.invalid/v1/chat/completions");
      expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", address: "8.8.8.8" });
      expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer sk-teste-falso-custom" });
      expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).model).toBe("modelo-custom-falso");
    }
  });

  it("blocks a DNS rebind and a redirect without another request", async () => {
    const query = jest.fn(async (_sql: string, values: unknown[] = []) => ({ rows: [{ id: values[0], kind: "custom", name: "Custom falso", baseUrl: "https://provedor.invalid/v1", secretCiphertext: "fake", models: [], enabled: true }], rowCount: 1 }));
    const managed = new ModelProvidersService({ getPool: () => ({ query }) } as never);
    (managed as any).box = { decrypt: () => "chave-chat-falsa" };
    const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, {} as IntegrationsService, managed);
    const request = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("", { status: 302, headers: { Location: "https://outro.invalid" } }));
    let resolution = 0;
    service.setTestDependencies(request as typeof fetch, async () => { resolution += 1; return ["10.0.0.5"]; });
    await expect(service.stream({ providerId: "123e4567-e89b-42d3-a456-426614174010", model: "m", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: { code: "AI_PROVIDER_REQUEST_FAILED" } });
    expect(request).toHaveBeenCalledTimes(0);
    expect(resolution).toBe(1);

    resolution = 0;
    service.setTestDependencies(request as typeof fetch, async () => ["8.8.8.8"]);
    await expect(service.stream({ providerId: "123e4567-e89b-42d3-a456-426614174010", model: "m", messages: [{ role: "user", content: "oi" }] })).rejects.toMatchObject({ response: { code: "AI_PROVIDER_REQUEST_FAILED" } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", address: "8.8.8.8" });
    expect(JSON.stringify(request.mock.results)).not.toContain("chave-chat-falsa");
  });

  it("allows an explicitly configured local endpoint", async () => {
    const query = jest.fn(async (_sql: string, values: unknown[] = []) => ({ rows: [{ id: values[0], kind: "custom", name: "Local", baseUrl: "http://localhost:11434/v1", secretCiphertext: "fake", models: [], enabled: true }], rowCount: 1 }));
    const managed = new ModelProvidersService({ getPool: () => ({ query }) } as never);
    (managed as any).box = { decrypt: () => "fake-key" };
    const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, {} as IntegrationsService, managed);
    const request = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("", { status: 200 }));
    service.setTestDependencies(request as typeof fetch, jest.fn(async () => { throw new Error("localhost must not resolve"); }));
    await expect(service.stream({ providerId: "123e4567-e89b-42d3-a456-426614174010", model: "m", messages: [{ role: "user", content: "oi" }] })).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ address: "127.0.0.1", redirect: "manual" }));
  });

  it("uses the default pinned fetcher for SSE, model errors, and manual redirects", async () => {
    let mode: "stream" | "bad-model" | "redirect" = "stream";
    let requests = 0;
    const server: Server = createServer((_req, res) => {
      requests += 1;
      if (mode === "stream") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end("data: [DONE]\n\n");
      } else if (mode === "bad-model") {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("model not found");
      } else {
        res.writeHead(302, { location: "http://127.0.0.1:1/redirect-target" });
        res.end("redirect");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const query = jest.fn(async (_sql: string, values: unknown[] = []) => ({ rows: [{ id: values[0], kind: "custom", name: "Local", baseUrl: `http://localhost:${port}/v1`, secretCiphertext: "fake", models: [], enabled: true }], rowCount: 1 }));
      const managed = new ModelProvidersService({ getPool: () => ({ query }) } as never);
      (managed as any).box = { decrypt: () => "chave-chat-falsa" };
      const service = new ProvidersService({} as OpenAiProvider, {} as AnthropicProvider, {} as IntegrationsService, managed);
      const input = { providerId: "123e4567-e89b-42d3-a456-426614174010", model: "modelo-local", messages: [{ role: "user" as const, content: "oi" }] };

      const streamed = await service.stream(input) as Response;
      expect(streamed).toBeInstanceOf(Response);
      expect(await streamed.text()).toBe("data: [DONE]\n\n");
      expect(requests).toBe(1);

      mode = "bad-model";
      await expect(service.stream(input)).rejects.toMatchObject({ response: { code: "AI_PROVIDER_REQUEST_FAILED", modelUnavailable: true } });
      expect(requests).toBe(2);

      mode = "redirect";
      await expect(service.stream(input)).rejects.toMatchObject({ response: { code: "AI_PROVIDER_REQUEST_FAILED" } });
      expect(requests).toBe(3);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
