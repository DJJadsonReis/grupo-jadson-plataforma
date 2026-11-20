import { plainPreview } from "./preview";
import type { Conversation } from "./workspace";
import type { Workspace } from "./workspace";

export interface ConversationSections {
  agents: Conversation[];
  conversations: Conversation[];
}

/** IDs confirmadamente carregados do servidor; UUIDs locais não são suficientes para isso. */
export function isPersistedConversation(id: string, serverConversationIds: Iterable<string>): boolean {
  return isServerConversationId(id) && new Set(serverConversationIds).has(id);
}

export function deletionErrorMessage(failed: boolean): string | null {
  return failed ? "Não foi possível excluir a conversa. Tente de novo." : null;
}

/** IDs locais não podem ser enviados a rotas cujo identificador no banco é UUID. */
export function isServerConversationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** Separa conversas diretas com agentes fixos; grupos continuam em Conversas. */
export function splitConversationSections(items: Conversation[], fixedAgentIds: Iterable<string>): ConversationSections {
  const agentIds = new Set(fixedAgentIds);
  return items.reduce<ConversationSections>((sections, item) => {
    if (!item.groupId && item.agentId && agentIds.has(item.agentId)) sections.agents.push(item);
    else sections.conversations.push(item);
    return sections;
  }, { agents: [], conversations: [] });
}

/** Remove uma conversa do workspace serializado sem alterar agentes ou grupos. */
export function removeConversationFromWorkspace(workspace: Workspace, id: string): Workspace {
  return { ...workspace, conversations: workspace.conversations.filter((item) => item.id !== id) };
}

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
