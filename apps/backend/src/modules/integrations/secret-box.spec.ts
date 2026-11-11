import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SecretBox } from "./secret-box";

describe("SecretBox", () => {
  const original = process.env.CREDENTIAL_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.CREDENTIAL_KEY;
    else process.env.CREDENTIAL_KEY = original;
  });

  it("cifra e decifra o mesmo valor, sem devolver o texto puro cifrado", () => {
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
    const box = new SecretBox(join(mkdtempSync(join(tmpdir(), "sb-")), ".env"));
    const encrypted = box.encrypt("tvly-chave-de-teste");
    expect(encrypted).not.toContain("tvly-chave-de-teste");
    expect(box.isEncrypted(encrypted)).toBe(true);
    expect(box.decrypt(encrypted)).toBe("tvly-chave-de-teste");
  });

  it("falha se o texto cifrado for adulterado", () => {
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
    const box = new SecretBox(join(mkdtempSync(join(tmpdir(), "sb-")), ".env"));
    const [prefix = "", iv = "", tag = "", body = ""] = box.encrypt("segredo-longo").split(":");
    const data = Buffer.from(body, "base64");
    data[0] = (data[0] ?? 0) ^ 1;
    expect(() => box.decrypt([prefix, iv, tag, data.toString("base64")].join(":"))).toThrow();
  });

  it("cria a chave no .env quando ela não existe e reutiliza depois", () => {
    delete process.env.CREDENTIAL_KEY;
    const envPath = join(mkdtempSync(join(tmpdir(), "sb-")), ".env");
    writeFileSync(envPath, "API_PORT=3333");
    const box = new SecretBox(envPath);
    const encrypted = box.encrypt("abc12345");
    expect(readFileSync(envPath, "utf8")).toMatch(/\nCREDENTIAL_KEY=.+\n/);
    expect(new SecretBox(envPath).decrypt(encrypted)).toBe("abc12345");
  });
});
