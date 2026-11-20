import { plainPreview } from "./preview";
import type { Conversation } from "./workspace";

/** Retorna a última mensagem visível em uma linha para a lista lateral. */
export function conversationRowPreview(conversation: Conversation): string {
  const last = [...conversation.messages].reverse().find((message) => message.content.trim().length > 0);
  return last ? plainPreview(last.content) : "Sem mensagens ainda";
}

/** Extrai até duas iniciais das primeiras palavras do nome. */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).filter((word) => !/^(de|da|do|das|dos)$/i.test(word));
  return words.length ? words.slice(0, 2).map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? "").join("") : "?";
}
