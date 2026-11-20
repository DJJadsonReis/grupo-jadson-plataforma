import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { CompletionInput } from "./provider.types";
import { AnthropicProvider } from "./anthropic.provider";
import { IntegrationsService } from "../integrations/integrations.service";
import { DEFAULT_MODELS, MODEL_CATALOGUE, MODEL_PROVIDER_NAMES, ModelProviderId } from "./model-catalogue";
import { ModelProvidersService } from "./model-providers.service";
import { modelsForProvider } from "./model-catalogue";
import { isProviderRedirect, resolveProviderDestination } from "./provider-destination";
import { pinnedFetch } from "../tools/page-reader";
import { lookup } from "node:dns/promises";

@Injectable()
export class ProvidersService {
  private fetcher: typeof fetch = ((input: string | Request | URL, init?: RequestInit) => pinnedFetch(input.toString(), init as Parameters<typeof pinnedFetch>[1]) as unknown as Promise<Response>) as typeof fetch;
  private lookupHost: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map(({ address }) => address);
  constructor(private readonly openAi: OpenAiProvider, private readonly anthropic: AnthropicProvider, private readonly integrations: IntegrationsService, private readonly modelProviders?: ModelProvidersService) {}

  setTestFetcher(fetcher: typeof fetch): void { this.fetcher = fetcher; }
  setTestDependencies(fetcher: typeof fetch, lookupHost?: (host: string) => Promise<string[]>): void { this.fetcher = fetcher; if (lookupHost) this.lookupHost = lookupHost; }

  async catalogue() {
    const key = (await this.integrations.secret("modelo_chave"))?.trim() ?? "";
    const savedEndpoint = (await this.integrations.secret("modelo_endereco"))?.trim() ?? "";
    const endpoint = savedEndpoint || (key.startsWith("AIza") ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" : "https://api.openai.com/v1/chat/completions");
    const host = new URL(endpoint).hostname.toLowerCase();
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host);
    const openAiHost = host === "api.openai.com";
    const geminiHost = host === "generativelanguage.googleapis.com";
    const configuredModelProvider: ModelProviderId = openAiHost ? "openai" : geminiHost ? "gemini" : "endpoint";
    const configured = Boolean(key) || local;
    const status: Record<ModelProviderId, boolean> = {
      openai: configured && configuredModelProvider === "openai",
      gemini: configured && configuredModelProvider === "gemini",
      endpoint: configured && configuredModelProvider === "endpoint",
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    };
    return (Object.keys(MODEL_PROVIDER_NAMES) as ModelProviderId[]).map((id) => ({
      id,
      name: MODEL_PROVIDER_NAMES[id],
      configured: status[id],
      defaultModel: DEFAULT_MODELS[id] ?? null,
      models: MODEL_CATALOGUE.filter((model) => model.provider === id),
    }));
  }

  /** Compatibilidade com a rota anterior usada pelo monitoramento. */
  async list() {
    return (await this.catalogue()).map(({ id, name, configured }) => ({ id, name, configured }));
  }

  stream(input: CompletionInput, signal?: AbortSignal) {
    if (input.providerId && this.modelProviders) return this.modelProviders.forChat(input.providerId).then(({ kind, baseUrl, apiKey }) => {
      const selectedModel = input.model || modelsForProvider(kind)[0]?.id || MODEL_CATALOGUE.find((model) => model.provider === kind)?.id || "";
      if (kind === "anthropic") return this.streamManagedAnthropic(input, apiKey, selectedModel, signal);
      return this.streamManagedCompatible(input, baseUrl ?? this.defaultUrl(kind), apiKey, selectedModel, signal);
    });
    return input.provider === "anthropic" ? this.anthropic.stream(input, signal) : this.openAi.stream(input, signal);
  }

  async validateManagedProvider(id: string): Promise<void> {
    if (!this.modelProviders) throw new Error("managed provider service unavailable");
    await this.modelProviders.forChat(id);
  }

  private defaultUrl(kind: string): string {
    const roots: Record<string, string> = { openai: "https://api.openai.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta/openai", xai: "https://api.x.ai/v1" };
    return roots[kind] ?? "";
  }

  private async streamManagedCompatible(input: CompletionInput, baseUrl: string, apiKey: string, model: string, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
      const allowLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(baseUrl);
      const destination = await resolveProviderDestination(url, allowLocal, this.lookupHost);
      const pinnedResponse = await (this.fetcher as unknown as (url: string, init: RequestInit & { address: string }) => Promise<Response>)(destination.url.toString(), { method: "POST", signal: signal ?? new AbortController().signal, redirect: "manual", address: destination.address, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: input.messages, stream: true, ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}), stream_options: { include_usage: true }, ...(input.generationConfig?.temperature === undefined ? {} : { temperature: input.generationConfig.temperature }), ...(input.generationConfig?.maxTokens === undefined ? {} : { max_tokens: input.generationConfig.maxTokens }) }) });
      response = pinnedResponse;
    } catch (error) { if (signal?.aborted) throw signal.reason ?? error; throw new ServiceUnavailableException({ code: "AI_PROVIDER_REQUEST_FAILED", message: "Não foi possível conectar ao provedor de IA." }); }
    if (isProviderRedirect(response.status)) throw new ServiceUnavailableException({ code: "AI_PROVIDER_REQUEST_FAILED", message: "O provedor de IA redirecionou a solicitação." });
    if (!response.ok) {
      const modelUnavailable = response.status === 400 && await this.modelUnavailable(response);
      throw new HttpException({ code: "AI_PROVIDER_REQUEST_FAILED", message: `O modelo respondeu com HTTP ${response.status}.`, upstreamStatus: response.status, modelUnavailable }, response.status >= 400 && response.status <= 599 ? response.status : 502);
    }
    return response;
  }

  private async streamManagedAnthropic(input: CompletionInput, apiKey: string, model: string, signal?: AbortSignal): Promise<Response> {
    const { anthropicStreamToOpenAi, translateAnthropicRequest } = await import("./anthropic.provider");
    let response: Response;
    try { response = await this.fetcher("https://api.anthropic.com/v1/messages", { method: "POST", signal: signal ?? null, headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(translateAnthropicRequest({ ...input, model })) }); }
    catch (error) { if (signal?.aborted) throw signal.reason ?? error; throw new ServiceUnavailableException({ code: "AI_PROVIDER_REQUEST_FAILED", message: "Não foi possível conectar ao provedor Anthropic." }); }
    if (!response.ok) {
      const modelUnavailable = response.status === 400 && await this.modelUnavailable(response);
      throw new HttpException({ code: "AI_PROVIDER_REQUEST_FAILED", message: `Anthropic respondeu com HTTP ${response.status}.`, upstreamStatus: response.status, modelUnavailable }, response.status >= 400 && response.status <= 599 ? response.status : 502);
    }
    return anthropicStreamToOpenAi(response);
  }

  private async modelUnavailable(response: Response): Promise<boolean> {
    try {
      const text = await response.clone().text();
      return /model.{0,40}(?:not found|unavailable|does not exist|unknown)|(?:not found|unavailable).{0,40}model/i.test(text);
    } catch { return false; }
  }
}
