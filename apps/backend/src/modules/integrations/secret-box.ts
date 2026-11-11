import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const PREFIX = "v1:";

/**
 * Cifra valores guardados no banco (AES-256-GCM). A chave fica em CREDENTIAL_KEY no .env
 * do backend (fora do git). Se ela não existir, é criada uma vez e gravada no .env.
 */
export class SecretBox {
  private key?: Buffer;

  constructor(private readonly envPath = join(process.cwd(), ".env")) {}

  private loadKey(): Buffer {
    if (this.key) return this.key;
    const existing = process.env.CREDENTIAL_KEY?.trim();
    let raw: string;
    if (existing) {
      raw = existing;
    } else {
      raw = randomBytes(32).toString("base64");
      if (existsSync(this.envPath)) {
        const content = readFileSync(this.envPath, "utf8");
        const sep = content.endsWith("\n") || content.length === 0 ? "" : "\n";
        appendFileSync(this.envPath, `${sep}CREDENTIAL_KEY=${raw}\n`);
      } else {
        appendFileSync(this.envPath, `CREDENTIAL_KEY=${raw}\n`);
      }
      process.env.CREDENTIAL_KEY = raw;
    }
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length !== 32) throw new Error("CREDENTIAL_KEY precisa ser 32 bytes em base64.");
    this.key = buffer;
    return buffer;
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.loadKey(), iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
  }

  decrypt(stored: string): string {
    if (!this.isEncrypted(stored)) return stored;
    const parts = stored.slice(PREFIX.length).split(":");
    const [ivB64 = "", tagB64 = "", dataB64 = ""] = parts;
    if (parts.length !== 3) throw new Error("Valor cifrado mal formado.");
    const decipher = createDecipheriv("aes-256-gcm", this.loadKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  }
}
