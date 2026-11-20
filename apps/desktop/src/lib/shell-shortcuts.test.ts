import { describe, expect, it } from "vitest";
import { shellShortcut } from "./shell-shortcuts";

describe("shellShortcut", () => {
  it("mapeia Ctrl+N, Ctrl+K e Ctrl+B", () => {
    expect(shellShortcut({ key: "n", ctrlKey: true })).toBe("new-chat");
    expect(shellShortcut({ key: "k", ctrlKey: true })).toBe("search");
    expect(shellShortcut({ key: "b", ctrlKey: true })).toBe("toggle-sidebar");
  });
  it("permite nova conversa e busca em campos, mas não alterna a barra", () => {
    expect(shellShortcut({ key: "n", ctrlKey: true, targetTag: "TEXTAREA" })).toBe("new-chat");
    expect(shellShortcut({ key: "k", ctrlKey: true, targetTag: "INPUT" })).toBe("search");
    expect(shellShortcut({ key: "b", ctrlKey: true, targetTag: "INPUT" })).toBeNull();
    expect(shellShortcut({ key: "b", ctrlKey: true, contentEditable: true })).toBeNull();
  });
  it("aceita Command no macOS e ignora modificadores extras", () => {
    expect(shellShortcut({ key: "k", ctrlKey: false, metaKey: true })).toBe("search");
    expect(shellShortcut({ key: "n", ctrlKey: true, shiftKey: true })).toBeNull();
  });
});
