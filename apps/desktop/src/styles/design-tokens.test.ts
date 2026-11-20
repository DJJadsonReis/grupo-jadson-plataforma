import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = fileURLToPath(new URL(".", import.meta.url));
const tokens = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

describe("referências de tokens dos estilos desktop", () => {
  it("define cada variável var(--...) usada pelos arquivos CSS do desktop", () => {
    const cssFiles = readdirSync(stylesDir).filter((name) => name.endsWith(".css"));
    const css = cssFiles.map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8")).join("\n");
    const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)([^)]*)\)/g)]
      .filter((match) => !match[2]!.includes(","))
      .map((match) => match[1]!));
    const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]!));
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
