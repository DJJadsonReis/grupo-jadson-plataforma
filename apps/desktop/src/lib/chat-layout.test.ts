import { describe, expect, it } from "vitest";
import { chatLayoutForMessages } from "./chat-layout";

describe("layout do chat", () => {
  it("centraliza saudação e compositor antes da primeira mensagem", () => {
    expect(chatLayoutForMessages(0)).toBe("empty");
  });
  it("move o compositor para o rodapé quando a conversa começa", () => {
    expect(chatLayoutForMessages(1)).toBe("conversation");
  });
});
