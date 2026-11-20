import { assertPersonalHost, parseEdition } from "./edition";

describe("edition configuration", () => {
  it.each([[undefined, "equipe"], ["equipe", "equipe"], ["pessoal", "pessoal"]] as const)("parses %s as %s", (value, expected) => {
    expect(parseEdition(value)).toBe(expected);
  });

  it("rejects an unknown edition with a clear Portuguese message", () => {
    expect(() => parseEdition("enterprise")).toThrow("Valor inválido para GRUPO_EDICAO");
  });

  it.each(["127.0.0.1", "::1", "localhost"])("accepts local host %s in personal mode", (host) => {
    expect(() => assertPersonalHost("pessoal", host)).not.toThrow();
  });

  it("rejects a non-loopback host in personal mode", () => {
    expect(() => assertPersonalHost("pessoal", "0.0.0.0")).toThrow("O modo pessoal só aceita conexões locais");
  });

  it("does not restrict team mode hosts", () => {
    expect(() => assertPersonalHost("equipe", "0.0.0.0")).not.toThrow();
  });
});
