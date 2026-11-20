import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { IntegrationsService } from "../integrations/integrations.service";
import { CompletionInput, LanguageModelProvider } from "./provider.types";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";
const availabilityCache = new Map<string, number>();
const AVAILABILITY_TTL_MS = 5 * 60 * 1000;

/**
 * Provedor de modelo compatível com a API da OpenAI. Chave, endereço e nome do modelo vêm das
 * Configurações do app; se faltarem, usa o .env. Endereço local (Ollama, LM Studio) não exige chave.
 */
@Injectable()
export class OpenAiProvider implements LanguageModelProvider {
  readonly id = "openai";

  constructor(private readonly integrations: IntegrationsService) {}

  private static isLocal(endpoint: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(endpoint);
  }

  /** Identifica o provedor pelo formato da chave, para o usuário só precisar colar a chave. */
  private static guessFromKey(key: string): { endpoint: string; model: string } | null {
    if (key.startsWith("AIza")) return { endpoint: GEMINI_ENDPOINT, model: GEMINI_MODEL };
    if (key.startsWith("sk-")) return { endpoint: DEFAULT_ENDPOINT, model: DEFAULT_MODEL };
    return null;
  }

  private async settings(): Promise<{ key: string; endpoint: string; model: string }> {
    const key = (await this.integrations.secret("modelo_chave"))?.trim() ?? "";
    const savedEndpoint = (await this.integrations.secret("modelo_endereco"))?.trim() ?? "";
    const savedModel = (await this.integrations.secret("modelo_padrao"))?.trim() ?? "";
    const guess = OpenAiProvider.guessFromKey(key);
    const endpoint = savedEndpoint || guess?.endpoint || DEFAULT_ENDPOINT;
    const model = savedModel || guess?.model || DEFAULT_MODEL;
    return { key, endpoint, model };
  }

  async isConfigured(): Promise<boolean> {
    const { key, endpoint } = await this.settings();
    return Boolean(key) || OpenAiProvider.isLocal(endpoint);
  }

  async stream(input: CompletionInput, signal?: AbortSignal): Promise<Response> {
    const { key, endpoint, model } = await this.settings();
    const apiKey = key || (OpenAiProvider.isLocal(endpoint) ? "local-no-key" : "");
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: "AI_PROVIDER_NOT_CONFIGURED",
        message: "Nenhum modelo de IA está configurado. Cole a chave do modelo em Configurações, na seção Modelo de IA.",
      });
    }

    const selectedModel = input.model || model;
    if (new URL(endpoint).host === "api.openai.com") {
      const availability = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(selectedModel)}`, {
        method: "GET", signal: signal ?? AbortSignal.timeout(5_000), headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => null);
      if (!availability) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: "Não foi possível verificar a disponibilidade do modelo OpenAI." });
      if (availability.status === 404) throw new ServiceUnavailableException({ code: "MODEL_UNAVAILABLE", message: `O modelo '${selectedModel}' não existe ou esta chave não tem acesso a ele.` });
      if (availability.status === 401 || availability.status === 403) throw new ServiceUnavailableException({ code: "MODEL_CREDENTIAL_REJECTED", message: "A OpenAI recusou a chave ao verificar o acesso ao modelo." });
      if (!availability.ok) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: `A OpenAI não confirmou o modelo '${selectedModel}' (HTTP ${availability.status}).` });
    } else {
      await this.checkCompatibleAvailability(endpoint, selectedModel, key, signal);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal: signal ?? null,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel, messages: input.messages, stream: true,
          ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}),
          stream_options: { include_usage: true },
          ...(input.generationConfig?.temperature === undefined ? {} : { temperature: input.generationConfig.temperature }),
          ...(input.generationConfig?.maxTokens === undefined ? {} : { max_tokens: input.generationConfig.maxTokens }),
        }),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: "AI_PROVIDER_REQUEST_FAILED",
        message: "NÃ£o foi possÃ­vel conectar ao provedor de IA. Confira o endereÃ§o e tente novamente.",
      });
    }

    if (!response.ok) {
      const hasImage = input.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"));
      throw new ServiceUnavailableException({
        code: "AI_PROVIDER_REQUEST_FAILED",
        message: hasImage
          ? `O modelo respondeu com HTTP ${response.status}; confirme se o modelo selecionado aceita imagens.`
          : `O modelo respondeu com HTTP ${response.status}. Confira a chave, o endereço e o nome do modelo em Configurações.`,
      });
    }
    if (!response.body) throw new ServiceUnavailableException("O modelo não retornou um fluxo de dados.");
    return response;
  }

  private async checkCompatibleAvailability(endpoint: string, model: string, key: string, signal?: AbortSignal): Promise<void> {
    const cacheKey = `${endpoint}\n${model}\n${createHash("sha256").update(key).digest("hex")}`;
    const cachedAt = availabilityCache.get(cacheKey);
    if (cachedAt !== undefined && Date.now() - cachedAt < AVAILABILITY_TTL_MS) return;
    if (cachedAt !== undefined) availabilityCache.delete(cacheKey);

    const modelsUrl = new URL(endpoint);
    modelsUrl.pathname = modelsUrl.pathname.replace(/\/chat\/completions\/?$/, "/models");
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    let response: Response | null;
    try { response = await fetch(modelsUrl, { method: "GET", signal: signal ?? AbortSignal.timeout(5_000), headers }); }
    catch { response = null; }
    if (!response) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: "Não foi possível verificar a disponibilidade do modelo." });
    if (response.status === 404) return;
    if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException({ code: "MODEL_CREDENTIAL_REJECTED", message: "O provedor recusou a chave ao verificar o acesso ao modelo." });
    if (!response.ok) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: `O provedor não confirmou o modelo (HTTP ${response.status}).` });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: "O provedor retornou uma lista de modelos inválida." }); }
    const data = (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: "O provedor retornou uma lista de modelos inválida." });
    const available = data.some((item) => item && typeof item === "object" && ((item as { id?: unknown }).id === model || (item as { name?: unknown }).name === model));
    if (!available) throw new ServiceUnavailableException({ code: "MODEL_UNAVAILABLE", message: `O modelo '${model}' não está disponível neste provedor.` });
    availabilityCache.set(cacheKey, Date.now());
  }
}
