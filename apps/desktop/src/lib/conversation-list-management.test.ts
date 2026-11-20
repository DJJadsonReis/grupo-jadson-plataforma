import { describe, expect, it } from "vitest";
import { deletionErrorMessage, isPersistedConversation, isServerConversationId, removeConversationFromWorkspace, splitConversationSections } from "./conversation-list";
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

  it("shows a transient error only for failed deletion", () => {
    expect(deletionErrorMessage(true)).toBe("Não foi possível excluir a conversa. Tente de novo.");
    expect(deletionErrorMessage(false)).toBeNull();
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
