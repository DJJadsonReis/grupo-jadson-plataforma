import { describe, expect, it } from "vitest";
import { cutAudioChunks, joinPartialText, resampleMono } from "./dictation-capture";

describe("ditado: funções de áudio", () => {
  it("converte áudio mono de 48 kHz para 16 kHz", () => {
    expect(resampleMono(new Float32Array(48_000), 48_000)).toHaveLength(16_000);
  });
  it("corta em trechos de três segundos", () => {
    expect(cutAudioChunks(new Float32Array(48_001))).toMatchObject([new Float32Array(48_000), new Float32Array(1)]);
  });
  it("junta partes sem espaços sobrando ou duplicados", () => {
    expect(joinPartialText(" Olá  ", "  equipe ")).toBe("Olá equipe");
  });
});
