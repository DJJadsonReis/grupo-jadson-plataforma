import { describe, expect, it } from "vitest";
import { conversationDeletionResult, deletionErrorMessage, isConversationDeletionComplete, isPersistedConversation, isServerConversationId, planConversationDeletion, removeConversationFromWorkspace, splitConversationSections } from "./conversation-list";
import type { Conversation, Workspace } from "./workspace";

const conversation = (id: string, values: Partial<Conversation> = {}): Conversation => ({ id, title: id, updatedAt: 0, messages: [], ...values });
const workspace: Workspace = { conversations: [conversation("a", { agentId: "agent-1" }), conversation("b")], agents: [], groups: [] };

describe("conversation list management", () => {
  it("recognizes server UUIDs and skips network for local IDs", () => {
    expect(isServerConversationId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isServerConversationId("local-conversation-1")).toBe(false);
  });

  it("only treats UUIDs present in the loaded server list as persisted", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(isPersistedConversation(id, [id])).toBe(true);
    expect(isPersistedConversation(id, [])).toBe(false);
    expect(isPersistedConversation("local-conversation-1", [id])).toBe(false);
  });

  it("keeps UUIDs when the server list failed, but removes local UUIDs when the loaded list is empty", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(planConversationDeletion(id, false, [])).toBe("keep-and-report");
    expect(planConversationDeletion(id, true, [])).toBe("remove-local");
    expect(planConversationDeletion("local-conversation-1", false, [])).toBe("remove-local");
    expect(planConversationDeletion(id, true, [id])).toBe("delete-server");
  });

  it("shows a transient error only for failed deletion", () => {
    expect(deletionErrorMessage(true)).toBe("Não foi possível excluir a conversa. Tente de novo.");
    expect(deletionErrorMessage(false)).toBeNull();
  });

  it("treats successful responses and missing conversations as completed deletions", () => {
    expect(isConversationDeletionComplete(200)).toBe(true);
    expect(isConversationDeletionComplete(204)).toBe(true);
    expect(isConversationDeletionComplete(404)).toBe(true);
    for (const status of [401, 403, 500]) {
      expect(isConversationDeletionComplete(status)).toBe(false);
      expect(conversationDeletionResult(status)).toBe("keep-and-report");
    }
    for (const status of [200, 204, 404]) expect(conversationDeletionResult(status)).toBe("remove");
  });

  it("separates direct fixed-agent chats and keeps groups under conversations", () => {
    const sections = splitConversationSections([
      conversation("agent-chat", { agentId: "agent-1" }),
      conversation("group-chat", { agentId: "agent-1", groupId: "group-1", type: "group" }),
      conversation("normal-chat"),
    ], ["agent-1"]);
    expect(sections.agents.map((item) => item.id)).toEqual(["agent-chat"]);
    expect(sections.conversations.map((item) => item.id)).toEqual(["group-chat", "normal-chat"]);
    expect(splitConversationSections([], ["agent-1"])).toEqual({ agents: [], conversations: [] });
  });

  it("removes a conversation from the serialized workspace and preserves the others", () => {
    const next = removeConversationFromWorkspace(workspace, "a");
    expect(JSON.stringify(next)).not.toContain('"id":"a"');
    expect(next.conversations.map((item) => item.id)).toEqual(["b"]);
  });
});
