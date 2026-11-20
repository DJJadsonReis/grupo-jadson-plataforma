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
});
