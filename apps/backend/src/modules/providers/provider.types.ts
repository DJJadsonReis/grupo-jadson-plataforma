export type ProviderMessageRole = "system" | "user" | "assistant";

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
}

export interface CompletionInput {
  messages: ProviderMessage[];
  model?: string;
}

export interface LanguageModelProvider {
  readonly id: string;
  isConfigured(): boolean;
  stream(input: CompletionInput, signal?: AbortSignal): Promise<Response>;
}
