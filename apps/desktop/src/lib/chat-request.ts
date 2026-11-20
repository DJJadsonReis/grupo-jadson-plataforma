import type { ChatMessage } from "./workspace";

export function attachmentsForChatRequest(selected: ChatMessage["attachments"], retryExistingUser: boolean): NonNullable<ChatMessage["attachments"]> {
  return retryExistingUser ? (selected ?? []).filter((attachment) => typeof attachment.dataUrl === "string") : (selected ?? []);
}

export function regenerationFields(retryExistingUser: boolean): { regenerate: true } | Record<string, never> {
  return retryExistingUser ? { regenerate: true } : {};
}
