import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CompletionInput, LanguageModelProvider } from "./provider.types";

@Injectable()
export class OpenAiProvider implements LanguageModelProvider {
  readonly id = "openai";

  /** Endpoint local compatível com a API OpenAI (Ollama, LM Studio, llama.cpp, vLLM) não exige chave. */
  private isLocalEndpoint(): boolean {
    const baseUrl = process.env.OPENAI_BASE_URL?.trim() ?? "";
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(baseUrl);
  }

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim()) || this.isLocalEndpoint();
  }

  async stream(input: CompletionInput, signal?: AbortSignal): Promise<Response> {
    const apiKey = process.env.OPENAI_API_KEY?.trim() || (this.isLocalEndpoint() ? "local-no-key" : "");
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: "AI_PROVIDER_NOT_CONFIGURED",
        message: "Nenhum provedor de IA está configurado. Configure OPENAI_API_KEY no ambiente do backend.",
      });
    }

    const response = await fetch(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: signal ?? null,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model || process.env.OPENAI_MODEL || "gpt-4o-mini", messages: input.messages, stream: true,
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
          ? `O provedor OpenAI respondeu com HTTP ${response.status}; confirme se o modelo selecionado aceita imagens.`
          : `O provedor OpenAI respondeu com HTTP ${response.status}.`,
      });
    }
    if (!response.body) throw new ServiceUnavailableException("O provedor não retornou um fluxo de dados.");
    return response;
  }
}
