import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listFiles, readText, safePath, writeText } from "./workspace-files";

describe("Computador do Bot: pasta de trabalho", () => {
  const original = process.env.WORKSPACE_DIR;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gj-ws-"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "nota.txt"), "olá");
    process.env.WORKSPACE_DIR = root;
  });

  afterAll(() => {
    process.env.WORKSPACE_DIR = original;
  });

  it("recusa caminho absoluto e subida de pasta", async () => {
    await expect(safePath(join(root, "..", "fora.txt"))).rejects.toThrow();
    await expect(safePath("../fora.txt")).rejects.toThrow("fora da pasta");
    await expect(safePath("C:\\Windows\\win.ini")).rejects.toThrow();
  });

  it("lê, lista e escreve dentro da pasta", async () => {
    expect((await listFiles("docs")).map((item) => item.nome)).toEqual(["nota.txt"]);
    expect((await readText("docs/nota.txt")).conteudo).toBe("olá");
    await writeText("novo/arquivo.md", "# oi");
    expect((await readText("novo/arquivo.md")).conteudo).toBe("# oi");
  });
});
