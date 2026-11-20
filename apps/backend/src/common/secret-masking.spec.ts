import { MIN_KNOWN_SECRET_LENGTH, maskSecrets, maskSecretValues, SECRET_REDACTION_MARKER } from "./secret-masking";

describe("secret masking", () => {
  it("mascara um segredo conhecido dentro do resultado estruturado de ferramenta", () => {
    const output = maskSecretValues({ results: [{ text: "credential=known-integration-secret" }] }, ["known-integration-secret"]);
    expect(output).toEqual({ results: [{ text: `credential=${SECRET_REDACTION_MARKER}` }] });
  });

  it("mascara chave sk mesmo sem conhecê-la", () => {
    expect(maskSecrets("Provider echoed sk-1234567890abcdefghijkl")).toBe(`Provider echoed ${SECRET_REDACTION_MARKER}`);
  });

  it("mascara formatos conhecidos de Tavily e Notion", () => {
    expect(maskSecrets("tvly-1234567890 secret_1234567890abcdef ntn_1234567890abcdef"))
      .toBe(`${SECRET_REDACTION_MARKER} ${SECRET_REDACTION_MARKER} ${SECRET_REDACTION_MARKER}`);
  });

  it("não mascara valores menores que o mínimo configurado", () => {
    expect(MIN_KNOWN_SECRET_LENGTH).toBe(8);
    expect(maskSecrets("key=short", ["short"])).toBe("key=short");
    expect(maskSecrets("sk-abc")).toBe("sk-abc");
  });

  it("mascara bearer token dentro de mensagem de erro", () => {
    expect(maskSecrets("Request failed: Bearer eyJhbGciOiJIUzI1NiJ9abcdefghijk")).toBe(`Request failed: ${SECRET_REDACTION_MARKER}`);
  });

  it("preserva texto normal", () => {
    const text = "A pesquisa encontrou três páginas sobre jardins.";
    expect(maskSecrets(text)).toBe(text);
  });

  it("mascara formatos proprietários falsos", () => {
    const fakeValues = [
      "AKIAFAKEFAKEFAKE0000",
      "sk_test_FALSO0000000000000000",
      "rk_live_FALSO0000000000000000",
      "pk_test_FALSO0000000000000000",
      "npm_FALSO00000000000000000000",
      "ya29.FALSO-token-de-teste-0000",
      "glpat-FALSO-token-de-teste-0000",
      "hf_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      "SG.FALSO-token-de-teste-0000.ABCDEFGHIJKLMNOPQRST",
    ];
    for (const fakeValue of fakeValues) {
      const output = maskSecrets(fakeValue);
      expect(output).not.toContain(fakeValue);
      expect(output).toContain(SECRET_REDACTION_MARKER);
    }
    expect(maskSecrets("ASIAFAKEFAKEFAKE0000")).toContain(SECRET_REDACTION_MARKER);
    expect(maskSecrets("rk_test_FALSO0000000000000000")).toContain(SECRET_REDACTION_MARKER);
  });

  it("mascara bloco PEM falso e PEM falso sem END", () => {
    const pem = "antes\n-----BEGIN RSA PRIVATE KEY-----\nMIIFAKEFAKEFAKE123\nCORPO-FALSO-PEM\n-----END RSA PRIVATE KEY-----\ndepois";
    const output = maskSecrets(pem);
    expect(output).toBe("antes\n[REDACTED]\ndepois");
    expect(maskSecrets("início -----BEGIN PRIVATE KEY-----\nCORPO-FALSO-PEM"))
      .toBe("início [REDACTED]");
  });

  it("preserva falsos positivos comuns", () => {
    const text = "a chave sk do sistema; hf_x; AKIA; SG.; npm_; Bearer; STRIPE_KEY";
    expect(maskSecrets(text)).toBe(text);
  });
});
