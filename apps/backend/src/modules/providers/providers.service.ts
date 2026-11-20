import { Injectable } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { CompletionInput } from "./provider.types";
import { AnthropicProvider } from "./anthropic.provider";
import { IntegrationsService } from "../integrations/integrations.service";
import { DEFAULT_MODELS, MODEL_CATALOGUE, MODEL_PROVIDER_NAMES, ModelProviderId } from "./model-catalogue";

@Injectable()
export class ProvidersService {
  constructor(private readonly openAi: OpenAiProvider, private readonly anthropic: AnthropicProvider, private readonly integrations: IntegrationsService) {}

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
    return input.provider === "anthropic" ? this.anthropic.stream(input, signal) : this.openAi.stream(input, signal);
  }
}
