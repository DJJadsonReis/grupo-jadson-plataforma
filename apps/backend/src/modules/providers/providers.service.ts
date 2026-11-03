import { Injectable } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { CompletionInput } from "./provider.types";

@Injectable()
export class ProvidersService {
  constructor(private readonly openAi: OpenAiProvider) {}

  list() {
    return [{ id: "openai", name: "OpenAI", configured: this.openAi.isConfigured() }];
  }

  stream(input: CompletionInput, signal?: AbortSignal) {
    return this.openAi.stream(input, signal);
  }
}
