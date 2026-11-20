export type ChatLayout = "empty" | "conversation";

export function chatLayoutForMessages(messageCount: number): ChatLayout {
  return messageCount > 0 ? "conversation" : "empty";
}
