import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { IntegrationsService } from "../integrations/integrations.service";
import { CompletionInput, LanguageModelProvider } from "./provider.types";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";

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

    const response = await fetch(endpoint, {
      method: "POST",
      signal: signal ?? null,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model || model, messages: input.messages, stream: true,
        stream_options: { include_usage: true },
        ...(input.generationConfig?.temperature === undefined ? {} : { temperature: input.generationConfig.temperature }),
        ...(input.generationConfig?.maxTokens === undefined ? {} : { max_tokens: input.generationConfig.maxTokens }),
      }),
    });

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
}
