import { DEFAULT_HOLD_CHARS, MaskedTextStream } from "./masked-text-stream";
import { maskSecrets } from "./secret-masking";

const SECRET = "sk-abcdefghijklmnop1234";

function fakeRsaPem(bodyLength: number, includeEnd = true): string {
  const line = "MIIFAKE-FALSO-" + "A".repeat(50);
  const body = Array.from({ length: Math.ceil(bodyLength / line.length) }, () => line).join("\n");
  return `-----BEGIN RSA PRIVATE KEY-----\n${body}\nCORPO-FALSO-PEM\n${includeEnd ? "-----END RSA PRIVATE KEY-----" : ""}`;
}

function fakePem(begin: string, end: string, bodyLength: number): string {
  const line = "MIIFAKE-FALSO-" + "A".repeat(50);
  const body = Array.from({ length: Math.ceil(bodyLength / line.length) }, () => line).join("\n");
  return `${begin}\n${body}\nCORPO-FALSO-PEM\n${end}`;
}

function runChunks(text: string, size: number): string {
  const chunks = text.match(new RegExp(`.{1,${size}}`, "gs")) ?? [];
  return runWithHold(chunks);
}

function runWithHold(chunks: string[], hold = DEFAULT_HOLD_CHARS): string {
  const out: string[] = [];
  const stream = new MaskedTextStream((text) => maskSecrets(text, []), (piece) => out.push(piece), hold);
  for (const chunk of chunks) stream.push(chunk);
  stream.flush();
  return out.join("");
}

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

  it("não libera corpo de PEM falso dividido em quatro partes antes do END", () => {
    const out: string[] = [];
    const stream = new MaskedTextStream((text) => maskSecrets(text, []), (piece) => out.push(piece), 8);
    stream.push("começo. -----BEGIN RSA PRIVATE KEY-----\n");
    stream.push("MIIFAKEFAKEFAKE\n");
    stream.push("CORPO-FALSO-PEM\n");
    stream.push("-----END RSA PRIVATE KEY----- fim longo para forçar emissão");
    stream.flush();
    const output = out.join("");
    expect(output).not.toContain("MIIFAKEFAKEFAKE");
    expect(output).not.toContain("CORPO-FALSO-PEM");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("começo.");
  });
  it.each([1, 7, 100])("maskea PEM RSA FALSO longo com pedaços de %i caracteres e hold padrão", (size) => {
    const pem = fakeRsaPem(1800);
    expect(pem.split("\n").filter((line) => line.startsWith("MIIFAKE")).every((line) => line.length === 64)).toBe(true);
    const text = `antes da chave. ${pem} depois da chave.`;
    const output = runWithHold(text.match(new RegExp(`.{1,${size}}`, "gs")) ?? []);
    expect(output).toContain("antes da chave.");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("depois da chave.");
    expect(output).not.toContain("MIIFAKE-FALSO");
    expect(output).not.toContain("CORPO-FALSO-PEM");
    expect(output).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(output).not.toContain("END RSA PRIVATE KEY");
  });

  it("maskea PEM FALSO mesmo quando END chega depois de mais de 512 caracteres", () => {
    const text = `antes. ${fakeRsaPem(1800)} depois.`;
    const output = runWithHold(text.match(/.{1,100}/gs) ?? []);
    expect(output).toContain("antes.");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("depois.");
    expect(output).not.toContain("MIIFAKE-FALSO");
    expect(output).not.toContain("CORPO-FALSO-PEM");
  });

  it("descarta corpo de PEM FALSO sem END após o limite de 16 KB", () => {
    const text = `antes. ${fakeRsaPem(18 * 1024, false)}`;
    const output = runWithHold(text.match(/.{1,100}/gs) ?? []);
    expect(output.startsWith("antes. ")).toBe(true);
    expect(output.endsWith("[REDACTED]")).toBe(true);
    expect(output).not.toContain("MIIFAKE-FALSO");
    expect(output).not.toContain("CORPO-FALSO-PEM");
  });

  it("preserva o texto depois de PEM RSA FALSO longo em todos os cortes de END", () => {
    const end = "-----END RSA PRIVATE KEY-----";
    const trailing = " depois do bloco FALSO, texto normal que deve sair";
    const prefix = fakePem("-----BEGIN RSA PRIVATE KEY-----", "", 18 * 1024);
    const cuts = Array.from({ length: end.length - 1 }, (_, index) => index + 1);
    for (const cut of cuts) {
      const output = runChunks(`${prefix}${end.slice(0, cut)}${end.slice(cut)}${trailing}`, 100);
      expect(output).toContain(trailing);
    expect(output).not.toContain("MIIFAKE-FALSO");
    expect(output).not.toContain("CORPO-FALSO-PEM");
    }
  });

  it.each([1, 7])("preserva texto depois de PEM RSA FALSO longo com chunks de %i", (size) => {
    const end = "-----END RSA PRIVATE KEY-----";
    const trailing = " depois do bloco FALSO, texto normal que deve sair";
    const prefix = fakePem("-----BEGIN RSA PRIVATE KEY-----", "", 18 * 1024);
    const text = `${prefix}${end}${trailing}`;
    const output = runChunks(text, size);
    expect(output).toContain(trailing);
    expect(output).not.toContain("MIIFAKE-FALSO");
    expect(output).not.toContain("CORPO-FALSO-PEM");
  });

  it.each([
    ["-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----"],
    ["-----BEGIN EC PRIVATE KEY-----", "-----END EC PRIVATE KEY-----"],
  ])("preserva texto depois de PEM FALSO longo %s em todos os cortes", (begin, end) => {
    const trailing = " depois do bloco FALSO, texto normal que deve sair";
    const prefix = fakePem(begin, "", 18 * 1024);
    for (let cut = 1; cut < end.length; cut += 1) {
      const output = runChunks(`${prefix}${end.slice(0, cut)}${end.slice(cut)}${trailing}`, 100);
      expect(output).toContain(trailing);
      expect(output).not.toContain("MIIFAKE-FALSO");
      expect(output).not.toContain("CORPO-FALSO-PEM");
    }
  });

  it("emite prefixo mascarado e uma única redação antes do texto posterior ao PEM FALSO", () => {
    const end = "-----END RSA PRIVATE KEY-----";
    const text = `prefixo legível. ${fakePem("-----BEGIN RSA PRIVATE KEY-----", "", 18 * 1024)}${end} sufixo legível. ${"continuação normal. ".repeat(40)}`;
    const output = runChunks(text, 100);
    expect(output).toContain("prefixo legível.");
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(1);
    expect(output).toContain(" sufixo legível.");
    expect(output).not.toContain("MIIFAKE-FALSO");
  });

  it("maskea PEM FALSO truncado ao receber flush", () => {
    const text = `antes. ${fakeRsaPem(900, false)}`;
    const output = runWithHold(text.match(/.{1,7}/gs) ?? []);
    expect(output).toBe("antes. [REDACTED]");
    expect(output).not.toContain("MIIFAKE-FALSO");
  });

  it("preserva texto normal com hold padrão depois de flush", () => {
    const text = "texto normal FAKE sem chave. ".repeat(100);
    const out: string[] = [];
    const stream = new MaskedTextStream((value) => value, (piece) => out.push(piece));
    stream.push(text);
    expect(out.length).toBeGreaterThan(0);
    stream.flush();
    expect(out.join("")).toBe(text);
  });
});
