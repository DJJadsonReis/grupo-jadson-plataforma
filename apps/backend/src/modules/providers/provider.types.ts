export type ProviderMessageRole = "system" | "user" | "assistant" | "tool";

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ProviderMessage {
  role: ProviderMessageRole;
  content?: string | null | { type: "text"; text: string }[] | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } })[];
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
}

export interface CompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: "string"; description: string }>;
      required?: string[];
      additionalProperties: true;
    };
  };
}

export interface CompletionInput {
  messages: ProviderMessage[];
  provider?: "openai" | "anthropic";
  providerId?: string;
  tools?: CompletionTool[];
  model?: string;
  generationConfig?: { temperature?: number; maxTokens?: number };
  reasoningEffort?: "baixo" | "medio" | "alto";
}

export interface LanguageModelProvider {
  readonly id: string;
  isConfigured(): boolean | Promise<boolean>;
  stream(input: CompletionInput, signal?: AbortSignal): Promise<Response>;
}
