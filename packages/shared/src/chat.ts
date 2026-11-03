export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  conversationId?: string;
  messages: ChatMessage[];
  model?: string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
}
