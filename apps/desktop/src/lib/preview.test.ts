import { describe, expect, it } from "vitest";
import { plainPreview } from "./preview";

describe("plainPreview", () => {
  it("remove marcas de markdown da prévia", () => {
    expect(plainPreview("## Resultado\n\n**Importante**: use `npm test` e [docs](https://x.y)")).toBe("Resultado Importante: use npm test e docs");
  });

  it("tira listas, citações, itálico e blocos de código", () => {
    expect(plainPreview("- item *um*\n> citação\n```ts\nconst a = 1;\n```\nfim")).toBe("item um citação fim");
  });

  it("corta textos longos com reticências", () => {
    const out = plainPreview("a".repeat(120), 10);
    expect(out).toBe("aaaaaaaaaa…");
  });
});
