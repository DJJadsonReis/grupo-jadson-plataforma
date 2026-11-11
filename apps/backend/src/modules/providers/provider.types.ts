export type ProviderMessageRole = "system" | "user" | "assistant";

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string | { type: "text"; text: string }[] | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } })[];
}

export interface CompletionInput {
  messages: ProviderMessage[];
  model?: string;
  generationConfig?: { temperature?: number; maxTokens?: number };
}

export interface LanguageModelProvider {
  readonly id: string;
  isConfigured(): boolean | Promise<boolean>;
  stream(input: CompletionInput, signal?: AbortSignal): Promise<Response>;
}
