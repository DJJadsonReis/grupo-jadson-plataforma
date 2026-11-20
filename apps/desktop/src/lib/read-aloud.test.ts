import { describe, expect, it, vi } from "vitest";
import { choosePtBrVoice, cleanForSpeech, loadAutoReadPreference, saveAutoReadPreference, shouldAutoRead } from "./read-aloud";

describe("cleanForSpeech", () => {
  it("omite blocos e preserva o conteúdo de código inline", () => {
    expect(cleanForSpeech("Olá ```ts\nconst x = 1;\n``` mundo")).toBe("Olá (bloco de código omitido) mundo");
    expect(cleanForSpeech("Use `const x = 1` agora")).toBe("Use const x = 1 agora");
  });
  it("remove destinos, URLs e marcadores de Markdown", () => {
    expect(cleanForSpeech("# Título\n- item **forte** [site](https://exemplo.com) https://url.test fim")).toBe("Título item forte site fim");
    expect(cleanForSpeech("***___~~~>>>---")).toBe("");
    expect(cleanForSpeech("1. ")).toBe("");
  });
  it("limita a 2000 caracteres sem cortar palavra", () => {
    const text = `${"palavra ".repeat(300)}fim.`;
    const result = cleanForSpeech(text);
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result.endsWith(" palavra")).toBe(true);
    expect(cleanForSpeech("a".repeat(2010))).toBe("");
  });
  it("corta em fim de frase ou espaço", () => {
    expect(cleanForSpeech(`${"a".repeat(1990)}. ${"b".repeat(30)}`)).toBe(`${"a".repeat(1990)}.`);
    expect(cleanForSpeech(`${"palavra ".repeat(250)}fim`).length).toBeLessThanOrEqual(2000);
  });
});

describe("choosePtBrVoice", () => {
  it("prefere pt-BR, sem diferenciar maiúsculas, e aceita pt genérico", () => {
    expect(choosePtBrVoice([{ lang: "pt-PT" }, { lang: "PT-br" }, { lang: "pt" }])).toBe(1);
    expect(choosePtBrVoice([{ lang: "en-US" }, { lang: "pt-PT" }])).toBe(1);
    expect(choosePtBrVoice([{ lang: "en-US" }])).toBeNull();
  });
});

describe("preferência de leitura automática", () => {
  it("usa desligado por padrão e persiste 1/0", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(loadAutoReadPreference(storage)).toBe(false);
    saveAutoReadPreference(storage, true);
    expect(values.get("grupo-jadson.leitura-automatica")).toBe("1");
    expect(loadAutoReadPreference(storage)).toBe(true);
    saveAutoReadPreference(storage, false);
    expect(values.get("grupo-jadson.leitura-automatica")).toBe("0");
    expect(loadAutoReadPreference(storage)).toBe(false);
  });
  it("absorve exceções do armazenamento", () => {
    const storage = { getItem: vi.fn(() => { throw new Error("indisponível"); }), setItem: vi.fn(() => { throw new Error("indisponível"); }) };
    expect(loadAutoReadPreference(storage)).toBe(false);
    expect(() => saveAutoReadPreference(storage, true)).not.toThrow();
  });
});

describe("shouldAutoRead", () => {
  const base = { enabled: true, supported: true, message: { role: "assistant", streaming: false, id: "m1" }, lastSpokenId: null, loadedFromHistory: false };
  it("lê apenas uma resposta nova concluída", () => {
    expect(shouldAutoRead(base)).toBe(true);
    expect(shouldAutoRead({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoRead({ ...base, supported: false })).toBe(false);
    expect(shouldAutoRead({ ...base, message: { ...base.message, role: "user" } })).toBe(false);
    expect(shouldAutoRead({ ...base, message: { ...base.message, streaming: true } })).toBe(false);
    expect(shouldAutoRead({ ...base, loadedFromHistory: true })).toBe(false);
    expect(shouldAutoRead({ ...base, lastSpokenId: "m1" })).toBe(false);
  });
});
