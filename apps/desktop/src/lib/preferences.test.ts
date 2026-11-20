import { describe, expect, it, vi } from "vitest";
import { buildPreferencesPayload, DEFAULT_PREFERENCES, isResponseStyle, isValidInstructions, loadPreferences, parsePreferences, savePreferences } from "./preferences";

describe("preferências", () => {
  it("usa estilo equilibrado por padrão e valida o texto e os estilos", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ instructions: "", responseStyle: "balanced" });
    expect(isValidInstructions("x".repeat(3000))).toBe(true);
    expect(isValidInstructions("x".repeat(3001))).toBe(false);
    expect(isResponseStyle("detailed")).toBe(true);
    expect(isResponseStyle("invalido")).toBe(false);
  });

  it("monta um corpo válido e rejeita texto excedente", () => {
    expect(buildPreferencesPayload("Use tópicos", "concise")).toEqual({ instructions: "Use tópicos", responseStyle: "concise" });
    expect(() => buildPreferencesPayload("x".repeat(3001), "balanced")).toThrow("3000");
  });

  it("normaliza valores recebidos da API", () => {
    expect(parsePreferences({ instructions: "Preferência", responseStyle: "detailed" })).toEqual({ instructions: "Preferência", responseStyle: "detailed" });
    expect(parsePreferences({ instructions: 3, responseStyle: "invalido" })).toEqual(DEFAULT_PREFERENCES);
  });

  it("carrega e salva pela API, reportando falhas e bloqueando texto excedente", async () => {
    const apiFetch = vi.fn(async () => ({ ok: true, json: async () => ({ instructions: "Olá", responseStyle: "concise" }) } as Response));
    await expect(loadPreferences(apiFetch, "http://api")).resolves.toEqual({ instructions: "Olá", responseStyle: "concise" });
    await expect(savePreferences(apiFetch, "http://api", "Olá", "detailed")).resolves.toEqual({ instructions: "Olá", responseStyle: "concise" });
    expect(apiFetch).toHaveBeenLastCalledWith("http://api/user-preferences", expect.objectContaining({ method: "PUT" }));
    apiFetch.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) } as Response));
    await expect(loadPreferences(apiFetch, "http://api")).rejects.toThrow("carregar");
    apiFetch.mockClear();
    await expect(savePreferences(apiFetch, "http://api", "x".repeat(3001), "balanced")).rejects.toThrow("3000");
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) } as Response));
    await expect(savePreferences(apiFetch, "http://api", "texto", "balanced")).rejects.toThrow("salvar");
  });
});
