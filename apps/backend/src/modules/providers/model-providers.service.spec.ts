import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ModelProvidersService } from "./model-providers.service";

const secretKey = Buffer.alloc(32, 7);
class TestSecretBox {
  encrypt(value: string): string { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", secretKey, iv); const body = Buffer.concat([cipher.update(value), cipher.final()]); return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${body.toString("base64")}`; }
  decrypt(value: string): string { const [, iv, tag, body] = value.split(":"); const decipher = createDecipheriv("aes-256-gcm", secretKey, Buffer.from(iv!, "base64")); decipher.setAuthTag(Buffer.from(tag!, "base64")); return Buffer.concat([decipher.update(Buffer.from(body!, "base64")), decipher.final()]).toString(); }
}
const fakeKey = "sk-teste-falso-000";
function setup() {
  const rows: Record<string, unknown>[] = [];
  const query = jest.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO model_providers")) {
      const row = { id: values[0], kind: values[1], name: values[2], baseUrl: values[3], secretCiphertext: values[4], enabled: true, createdAt: new Date(), updatedAt: new Date() };
      rows.push(row); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("SELECT id,kind,name FROM model_providers")) return { rows: rows.filter((row) => row.enabled === true && row.secretCiphertext !== "").map(({ id, kind, name }) => ({ id, kind, name })), rowCount: rows.length };
    if (sql.startsWith("SELECT id,kind,name,base_url AS \"baseUrl\"")) {
      const found = sql.includes("WHERE id=$1") ? rows.filter((row) => row.id === values[0]) : rows.filter((row) => row.enabled === true && row.secretCiphertext !== "");
      return { rows: found, rowCount: found.length };
    }
    if (sql.startsWith("SELECT name FROM integrations")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("UPDATE model_providers")) {
      const row = rows.find((item) => item.id === values[0]); if (!row) return { rows: [], rowCount: 0 };
      Object.assign(row, { name: values[1], enabled: values[2], baseUrl: values[3], secretCiphertext: values[4] }); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("DELETE FROM model_providers")) { const index = rows.findIndex((item) => item.id === values[0]); if (index >= 0) rows.splice(index, 1); return { rows: [], rowCount: index >= 0 ? 1 : 0 }; }
    throw new Error(`unexpected query ${sql}`);
  });
  const database = { getPool: () => ({ query }) } as never;
  const service = new ModelProvidersService(database);
  service.setTestSecretBox(new TestSecretBox() as never);
  service.setTestDependencies(jest.fn(async () => new Response(JSON.stringify({ data: [{ id: "model-falso", display_name: "Modelo falso" }] }), { status: 200 })), async () => ["203.0.113.10"]);
  return { service, rows, query };
}

describe("ModelProvidersService", () => {
  it("stores ciphertext and omits the key from response and listing", async () => {
    const { service, rows } = setup();
    const result = await service.create({ kind: "anthropic", name: "Anthropic falso", apiKey: fakeKey });
    expect(result).not.toHaveProperty("apiKey"); expect(JSON.stringify(result)).not.toContain(fakeKey);
    expect(rows[0]?.secretCiphertext).not.toBe(fakeKey); expect(new TestSecretBox().decrypt(String(rows[0]?.secretCiphertext))).toBe(fakeKey);
    expect(JSON.stringify(await service.list())).not.toContain(fakeKey);
  });
  it("does not replace a key when PATCH receives an empty apiKey", async () => {
    const { service, rows } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const ciphertext = rows[0]?.secretCiphertext; await service.patch(created.id, { apiKey: "" });
    expect(rows[0]?.secretCiphertext).toBe(ciphertext);
  });
  it("tests connection with a fake fetch and maps rejection and timeout to Portuguese", async () => {
    const { service } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    await expect(service.test(created.id)).resolves.toMatchObject({ ok: true, models: [{ id: "model-falso", label: "Modelo falso" }] });
    service.setTestDependencies(jest.fn(async () => new Response("", { status: 401 })));
    await expect(service.test(created.id)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/chave/i) });
    const timeoutFetch = jest.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    service.setTestDependencies(timeoutFetch);
    jest.useFakeTimers();
    try {
      const pending = service.test(created.id);
      await jest.advanceTimersByTimeAsync(8000);
      await expect(pending).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/8 segundos/i) });
    } finally { jest.useRealTimers(); }
  });
  it("enforces custom endpoint URL and explicit local allowance", async () => {
    const { service } = setup();
    for (const input of [
      { kind: "custom", name: "Custom falso", apiKey: fakeKey },
      { kind: "custom", name: "Custom falso", apiKey: fakeKey, baseUrl: "http://provedor.invalid" },
      { kind: "custom", name: "Custom falso", apiKey: fakeKey, baseUrl: "https://user:pass@provedor.invalid" },
      { kind: "custom", name: "Custom falso", apiKey: fakeKey, baseUrl: "https://10.0.0.1/v1" },
    ]) await expect(service.create(input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ kind: "custom", name: "Local falso", apiKey: fakeKey, baseUrl: "http://127.0.0.1:9000/v1", allowLocal: true })).resolves.toMatchObject({ kind: "custom" });
  });
  it("omits disabled and keyless providers from selectable and deletes providers", async () => {
    const { service } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    expect(await service.selectable()).toHaveLength(1);
    await service.remove(created.id); await expect(service.test(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
