import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokensPath = fileURLToPath(new URL("../styles/design-tokens.css", import.meta.url));

describe("tokens visuais do desktop", () => {
  it("define as cores de fundo e texto e os raios de cartão e composer", () => {
    const css = readFileSync(tokensPath, "utf8");
    expect(css).toMatch(/--gj-bg-dark\s*:/);
    expect(css).toMatch(/--gj-text-primary\s*:/);
    expect(css).toMatch(/--gj-text-secondary-contrast\s*:/);
    expect(css).toMatch(/--gj-card-radius\s*:/);
    expect(css).toMatch(/--gj-composer-radius\s*:/);
  });
});
