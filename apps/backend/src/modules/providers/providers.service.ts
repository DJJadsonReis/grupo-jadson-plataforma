import { Injectable } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { CompletionInput } from "./provider.types";
import { AnthropicProvider } from "./anthropic.provider";

@Injectable()
export class ProvidersService {
  constructor(private readonly openAi: OpenAiProvider, private readonly anthropic: AnthropicProvider) {}

  async list() {
    return [
      { id: "openai", name: "Modelo de IA", configured: await this.openAi.isConfigured() },
      { id: "anthropic", name: "Anthropic", configured: await this.anthropic.isConfigured() },
    ];
  }

  stream(input: CompletionInput, signal?: AbortSignal) {
    return input.provider === "anthropic" ? this.anthropic.stream(input, signal) : this.openAi.stream(input, signal);
  }
}
