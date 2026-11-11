import { Injectable } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { CompletionInput } from "./provider.types";

@Injectable()
export class ProvidersService {
  constructor(private readonly openAi: OpenAiProvider) {}

  async list() {
    return [{ id: "openai", name: "Modelo de IA", configured: await this.openAi.isConfigured() }];
  }

  stream(input: CompletionInput, signal?: AbortSignal) {
    return this.openAi.stream(input, signal);
  }
}
