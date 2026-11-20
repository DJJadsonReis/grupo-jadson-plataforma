import { MaskedTextStream } from "./masked-text-stream";
import { maskSecrets } from "./secret-masking";

const SECRET = "sk-abcdefghijklmnop1234";

function run(chunks: string[], hold = 16, known: string[] = [SECRET]) {
  const out: string[] = [];
  const stream = new MaskedTextStream((text) => maskSecrets(text, known), (piece) => out.push(piece), hold);
  for (const chunk of chunks) stream.push(chunk);
  stream.flush();
  return out.join("");
}

describe("MaskedTextStream", () => {
  it("nunca emite um segredo cortado entre pedaços", () => {
    const text = `Use a chave ${SECRET} com cuidado.`;
    // corta o segredo em pedaços de 3 caracteres
    const chunks = text.match(/.{1,3}/g) ?? [];
    const output = run(chunks);
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain("abcdef");
    expect(output).toContain("[REDACTED]");
    expect(output).toBe(maskSecrets(text, [SECRET]));
  });

  it("mascara um Bearer dividido logo após a palavra Bearer", () => {
    const token = "Bearer abcdefghijklmnopqrstuvwx";
    const chunks = token.match(/.{1,2}/g) ?? [];
    const output = run(["Cabeçalho: ", ...chunks, " fim do texto para forçar emissão"], 8, []);
    expect(output).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(output).toContain("[REDACTED]");
  });

  it("libera a resposta enquanto ela chega, sem esperar o fim", () => {
    const out: string[] = [];
    const stream = new MaskedTextStream((text) => text, (piece) => out.push(piece), 10);
    stream.push("primeira frase completa. ");
    stream.push("segunda frase que é longa o bastante para passar da janela");
    expect(out.length).toBeGreaterThan(0);
    stream.flush();
    expect(out.join("")).toBe("primeira frase completa. segunda frase que é longa o bastante para passar da janela");
  });

  it("texto sem segredo sai igual", () => {
    const text = "Olá, tudo bem? Esta é uma resposta comum sem nada sensível.";
    expect(run(text.match(/.{1,4}/g) ?? [], 12, [])).toBe(text);
  });

  it("discard descarta o que foi segurado", () => {
    const out: string[] = [];
    const stream = new MaskedTextStream((text) => text, (piece) => out.push(piece), 100);
    stream.push("texto que vira chamada de ferramenta");
    stream.discard();
    stream.flush();
    expect(out).toEqual([]);
  });
});
