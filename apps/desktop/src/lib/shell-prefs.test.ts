import { describe, expect, it } from "vitest";
import { DEFAULT_SHELL_PREFS, readShellPrefs, SHELL_PREFS_KEY, writeShellPrefs } from "./shell-prefs";

describe("preferências da casca", () => {
  it("usa tema escuro e barra expandida por padrão", () => expect(readShellPrefs(null)).toEqual(DEFAULT_SHELL_PREFS));
  it("grava e lê tema e barra lateral", () => {
    let saved = "";
    const storage = { getItem: () => saved, setItem: (key: string, value: string) => { expect(key).toBe(SHELL_PREFS_KEY); saved = value; } };
    writeShellPrefs(storage, { sidebarCollapsed: true, theme: "light" });
    expect(readShellPrefs(storage)).toEqual({ sidebarCollapsed: true, theme: "light" });
  });
  it("faz fallback quando localStorage lança erro", () => {
    expect(readShellPrefs({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_SHELL_PREFS);
    expect(() => writeShellPrefs({ setItem: () => { throw new Error("blocked"); } }, DEFAULT_SHELL_PREFS)).not.toThrow();
  });
});
