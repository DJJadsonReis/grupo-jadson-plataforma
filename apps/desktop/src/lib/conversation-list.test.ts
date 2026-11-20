import { describe, expect, it } from "vitest";
import { avatarInitials, conversationRowPreview } from "./conversation-list";
import type { Conversation } from "./workspace";

const conversation = (contents: string[]): Conversation => ({
  id: "c1", title: "Teste", updatedAt: 0,
  messages: contents.map((content) => ({ role: "user", content })),
});

describe("conversationRowPreview", () => {
  it("usa a última mensagem não vazia e colapsa espaços", () => {
    expect(conversationRowPreview(conversation(["anterior", "  última\n mensagem  "]))).toBe("última mensagem");
  });

  it("mostra o estado vazio", () => {
    expect(conversationRowPreview(conversation([]))).toBe("Sem mensagens ainda");
    expect(conversationRowPreview(conversation(["  "]))).toBe("Sem mensagens ainda");
  });

  it("usa os rótulos de plainPreview para blocos especiais", () => {
    expect(conversationRowPreview(conversation(['```componente\n{"tipo":"cartao"}\n```']))).toBe("[componente]");
    expect(conversationRowPreview(conversation(["```ts\nconst a = 1;\n```"]))).toBe("");
  });
});

describe("avatarInitials", () => {
  it("extrai uma ou duas iniciais", () => {
    expect(avatarInitials("Jadxu")).toBe("J");
    expect(avatarInitials("grupo de vendas")).toBe("GV");
    expect(avatarInitials("Ângela Ribeiro")).toBe("ÂR");
  });

  it("usa ? quando o nome está vazio", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("  ")).toBe("?");
  });
});
