import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ModelProvidersService } from "./model-providers.service";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

const secretKey = Buffer.alloc(32, 7);
class TestSecretBox {
  encrypt(value: string): string { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", secretKey, iv); const body = Buffer.concat([cipher.update(value), cipher.final()]); return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${body.toString("base64")}`; }
  decrypt(value: string): string { const [, iv, tag, body] = value.split(":"); const decipher = createDecipheriv("aes-256-gcm", secretKey, Buffer.from(iv!, "base64")); decipher.setAuthTag(Buffer.from(tag!, "base64")); return Buffer.concat([decipher.update(Buffer.from(body!, "base64")), decipher.final()]).toString(); }
}
const fakeKey = "sk-teste-falso-000";
function setup(useDefaultFetcher = false) {
  const rows: Record<string, unknown>[] = [];
  const availability: Record<string, unknown>[] = [];
  const query = jest.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO model_providers")) {
      const row = { id: values[0], kind: values[1], name: values[2], baseUrl: values[3], secretCiphertext: values[4], models: JSON.parse(String(values[5] ?? "[]")), enabled: true, createdAt: new Date(), updatedAt: new Date() };
      rows.push(row); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("SELECT model_id,status,checked_at")) return { rows: availability.filter((row) => row.provider_id === values[0]), rowCount: availability.length };
    if (sql.startsWith("SELECT status FROM model_availability")) return { rows: availability.filter((row) => row.provider_id === values[0] && row.model_id === values[1]), rowCount: 1 };
    if (sql.startsWith("INSERT INTO model_availability")) { const [provider_id, model_id, status] = values; const old = availability.find((row) => row.provider_id === provider_id && row.model_id === model_id); if (old) old.status = status; else availability.push({ provider_id, model_id, status, checked_at: new Date() }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith("SELECT id,kind,name,models_json")) return { rows: rows.filter((row) => row.enabled === true && row.secretCiphertext !== "").map(({ id, kind, name, models }) => ({ id, kind, name, models })), rowCount: rows.length };
    if (sql.startsWith("SELECT id,kind,name,base_url AS \"baseUrl\"")) {
      const found = sql.includes("WHERE id=$1") ? rows.filter((row) => row.id === values[0]) : rows.filter((row) => row.enabled === true && row.secretCiphertext !== "");
      return { rows: found.map((row) => ({ ...row, models: rows.find((item) => item.id === row.id)?.models })), rowCount: found.length };
    }
    if (sql.startsWith("SELECT name FROM integrations")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("UPDATE model_providers")) {
      const row = rows.find((item) => item.id === values[0]); if (!row) return { rows: [], rowCount: 0 };
      if (sql.includes("SET models_json")) { row.models = JSON.parse(String(values[1])); return { rows: [row], rowCount: 1 }; }
      Object.assign(row, { name: values[1], enabled: values[2], baseUrl: values[3], secretCiphertext: values[4], models: JSON.parse(String(values[5] ?? "[]")) }); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("DELETE FROM model_providers")) { const index = rows.findIndex((item) => item.id === values[0]); if (index >= 0) rows.splice(index, 1); return { rows: [], rowCount: index >= 0 ? 1 : 0 }; }
    throw new Error(`unexpected query ${sql}`);
  });
  const database = { getPool: () => ({ query }) } as never;
  const service = new ModelProvidersService(database);
  service.setTestSecretBox(new TestSecretBox() as never);
  if (!useDefaultFetcher) service.setTestDependencies(jest.fn(async () => new Response(JSON.stringify({ data: [{ id: "model-falso", display_name: "Modelo falso" }] }), { status: 200 })), async () => ["8.8.8.8"]);
  return { service, rows, query, availability };
}

describe("ModelProvidersService", () => {
  it("stores ciphertext and omits the key from response and listing", async () => {
    const { service, rows } = setup();
    const result = await service.create({ kind: "anthropic", name: "Anthropic falso", apiKey: fakeKey });
    expect(result).not.toHaveProperty("apiKey"); expect(JSON.stringify(result)).not.toContain(fakeKey);
    expect(rows[0]?.secretCiphertext).not.toBe(fakeKey); expect(new TestSecretBox().decrypt(String(rows[0]?.secretCiphertext))).toBe(fakeKey);
    expect(JSON.stringify(await service.list())).not.toContain(fakeKey);
  });
  it("discovers models on create, persists them, and exposes them for chat and agents", async () => {
    const { service, rows } = setup();
    const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    expect(created.models).toEqual([expect.objectContaining({ id: "model-falso", label: "Modelo falso", availability: "disponivel", checkedAt: expect.any(Date) })]);
    expect(await service.selectable()).toEqual([{ providerId: created.id, providerName: "OpenAI falso", models: [{ id: "model-falso", label: "Modelo falso" }] }]);
    await expect(service.validateAgentTarget(created.id, "model-falso")).resolves.toBeUndefined();
    expect(rows[0]?.models).toEqual([{ id: "model-falso", label: "Modelo falso" }]);
  });
  it.each(["openai", "anthropic", "gemini", "xai", "custom"] as const)("records model availability for %s and blocks unavailable agent targets", async (kind) => {
    const { service, availability } = setup();
    const input = { kind, name: `provedor ${kind}`, apiKey: fakeKey, ...(kind === "custom" ? { baseUrl: "http://127.0.0.1:9000/v1", allowLocal: true } : {}) };
    const created = await service.create(input);
    expect(created.models[0]).toMatchObject({ availability: "disponivel", checkedAt: expect.any(Date) });
    expect(availability[0]).toMatchObject({ status: "disponivel" });
    service.setTestDependencies(jest.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const checked = await service.checkModels(created.id);
    expect(checked.models.find((model) => model.id === "model-falso")?.availability).toBe("indisponivel");
    await expect(service.validateAgentTarget(created.id, "model-falso")).rejects.toMatchObject({ response: { code: "MODEL_UNAVAILABLE" } });
  });
  it("marks failed checks not verified without exposing keys", async () => {
    const { service, availability } = setup(); const created = await service.create({ kind: "openai", name: "Falso", apiKey: fakeKey });
    service.setTestDependencies(jest.fn(async () => { throw new Error(`failed ${fakeKey}`); }));
    const checked = await service.checkModels(created.id);
    expect(checked.models[0]?.availability).toBe("nao_verificado");
    expect(availability[0]).toMatchObject({ status: "nao_verificado" });
    expect(JSON.stringify(checked)).not.toContain(fakeKey);
  });
  it("blocks the chat check before a provider request and marks upstream missing models unavailable", async () => {
    const { service, availability } = setup(); const created = await service.create({ kind: "openai", name: "Falso", apiKey: fakeKey });
    service.setTestDependencies(jest.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await service.checkModels(created.id);
    await expect(service.assertAvailable(created.id, "model-falso")).rejects.toMatchObject({ response: { code: "MODEL_UNAVAILABLE", message: expect.stringContaining("model-falso") } });
    await service.markDiscoveredModelUnavailable(created.id, "modelo-inesistente");
    expect(availability.find((entry) => entry.model_id === "modelo-inesistente")?.status).toBe("indisponivel");
    expect(JSON.stringify(availability)).not.toContain(fakeKey);
  });
  it("persists removed models as unavailable when a new list responds", async () => {
    const { service, availability } = setup(); const created = await service.create({ kind: "openai", name: "Falso", apiKey: fakeKey });
    service.setTestDependencies(jest.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await service.checkModels(created.id);
    expect(availability.find((entry) => entry.model_id === "model-falso")?.status).toBe("indisponivel");
    expect((await service.list())[0]?.models[0]).toMatchObject({ id: "model-falso", availability: "indisponivel", checkedAt: expect.any(Date) });
  });
  it("keeps a saved key and returns a safe warning when discovery fails", async () => {
    const { service, rows } = setup();
    service.setTestDependencies(jest.fn(async () => new Response("", { status: 401 })));
    const created = await service.create({ kind: "custom", name: "Custom falso", baseUrl: "http://127.0.0.1:9000/v1", allowLocal: true, apiKey: fakeKey });
    expect(created.hasKey).toBe(true); expect(created.models).toEqual([]);
    expect(created.discoveryMessage).toMatch(/recusada/i); expect(created.discoveryMessage).not.toContain(fakeKey);
    expect(rows[0]?.models).toEqual([]);
  });
  it("keeps models on network failure and falls back to the catalog only when saved models are empty", async () => {
    const { service, rows } = setup();
    const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const saved = rows[0]?.models;
    service.setTestDependencies(jest.fn(async () => { throw new Error("network with secret " + fakeKey); }));
    const failedTest = await service.test(created.id);
    expect(failedTest).toMatchObject({ ok: false });
    expect(JSON.stringify(failedTest)).not.toContain(fakeKey);
    expect(rows[0]?.models).toEqual(saved);
    rows[0]!.models = [];
    const fallback = await service.selectable();
    expect(fallback).toHaveLength(1); expect(fallback[0]?.models.map((model) => model.id)).toContain("gpt-4o-mini");
    await service.patch(created.id, { enabled: false });
    expect(await service.selectable()).toEqual([]);
  });
  it("does not rediscover whitespace keys and updates models after a replacement key", async () => {
    const { service, query } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ data: [{ id: "novo-modelo" }] }), { status: 200 }));
    service.setTestDependencies(fetcher);
    const before = fetcher.mock.calls.length;
    const unchanged = await service.patch(created.id, { apiKey: "  " });
    expect(fetcher).toHaveBeenCalledTimes(before); expect(unchanged.models).toEqual(created.models);
    const replaced = await service.patch(created.id, { apiKey: "sk-teste-falso-001" });
    expect(fetcher).toHaveBeenCalledTimes(before + 1);
    expect(replaced.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "novo-modelo", label: "novo-modelo", availability: "disponivel" }),
      expect.objectContaining({ id: "model-falso", availability: "indisponivel" }),
    ]));
  });
  it("does not replace a key when PATCH receives an empty apiKey", async () => {
    const { service, rows } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const ciphertext = rows[0]?.secretCiphertext; await service.patch(created.id, { apiKey: "" });
    expect(rows[0]?.secretCiphertext).toBe(ciphertext);
  });
  it.each(["   ", "\t \n"])("does not replace a key when PATCH receives only whitespace (%j)", async (apiKey) => {
    const { service, rows } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const ciphertext = rows[0]?.secretCiphertext;
    const result = await service.patch(created.id, { apiKey });
    expect(rows[0]?.secretCiphertext).toBe(ciphertext);
    expect(result.hasKey).toBe(true);
  });
  it("trims a replacement key before encrypting it", async () => {
    const { service, rows } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    await service.patch(created.id, { apiKey: "  sk-teste-falso-001  " });
    expect(new TestSecretBox().decrypt(String(rows[0]?.secretCiphertext))).toBe("sk-teste-falso-001");
  });
  it.each([" ".repeat(2) + "x".repeat(501) + " ".repeat(2), 12345])("rejects an invalid PATCH key without replacing the saved key (%j)", async (apiKey) => {
    const { service, rows } = setup(); const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    const ciphertext = rows[0]?.secretCiphertext;
    await expect(service.patch(created.id, { apiKey })).rejects.toMatchObject({ status: 400 });
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
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/10 segundos/i) });
    } finally { jest.useRealTimers(); }
  });
  it("pins discovery to the just-validated address, blocks rebinding, and rejects redirects", async () => {
    const { service } = setup();
    const created = await service.create({ kind: "custom", name: "Custom", baseUrl: "https://provedor.invalid/v1", apiKey: fakeKey });
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 }));
    let resolutions = 0;
    service.setTestDependencies(fetcher, async () => { resolutions += 1; return ["10.0.0.5"]; });
    const rebound = await service.test(created.id);
    expect(rebound).toMatchObject({ ok: false });
    expect(fetcher).toHaveBeenCalledTimes(0);
    expect(resolutions).toBe(1);

    service.setTestDependencies(fetcher, async () => ["8.8.8.8"]);
    await service.test(created.id);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("provedor.invalid/v1/models"), expect.objectContaining({ address: "8.8.8.8", redirect: "manual" }));

    fetcher.mockResolvedValue(new Response("", { status: 302, headers: { Location: "https://outro.invalid" } }));
    const before = fetcher.mock.calls.length;
    const redirected = await service.test(created.id);
    expect(redirected).toMatchObject({ ok: false });
    expect(fetcher).toHaveBeenCalledTimes(before + 1);
    expect(JSON.stringify(redirected)).not.toContain(fakeKey);
  });

  it("allows explicitly configured local endpoints during discovery", async () => {
    const { service } = setup();
    const created = await service.create({ kind: "custom", name: "Local", baseUrl: "http://localhost:11434/v1", allowLocal: true, apiKey: fakeKey });
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    service.setTestDependencies(fetcher, jest.fn(async () => { throw new Error("localhost must not resolve"); }));
    await service.test(created.id);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("localhost:11434/v1/models"), expect.objectContaining({ address: "127.0.0.1", redirect: "manual" }));
  });
  it("uses the default pinned fetcher as a complete Response for local discovery", async () => {
    let requests = 0;
    const server: Server = createServer((_req, res) => {
      requests += 1;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-provider-test", "present");
      res.end(JSON.stringify({ data: [{ id: "modelo-local", display_name: "Modelo local" }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { service } = setup(true);
      const created = await service.create({ kind: "custom", name: "Local", baseUrl: `http://localhost:${port}/v1`, allowLocal: true, apiKey: fakeKey });
      expect(created.models).toEqual([expect.objectContaining({ id: "modelo-local", label: "Modelo local", availability: "disponivel" })]);
      const fetcher = (service as unknown as { fetcher: (url: string, init: RequestInit) => Promise<Response> }).fetcher;
      const response = await fetcher(`http://localhost:${port}/v1/models`, { method: "GET", headers: {}, signal: new AbortController().signal, redirect: "manual", address: "127.0.0.1" } as RequestInit & { address: string });
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("x-provider-test")).toBe("present");
      expect(response.body).not.toBeNull();
      expect(await response.clone().json()).toEqual({ data: [{ id: "modelo-local", display_name: "Modelo local" }] });
      expect(await response.text()).toContain("modelo-local");
      expect(requests).toBe(2);
      expect(JSON.stringify(created)).not.toContain(fakeKey);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("rejects a local discovery URL without allowLocal before reaching the server using the default fetcher", async () => {
    let requests = 0;
    const server: Server = createServer((_req, res) => { requests += 1; res.end("{}"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { service } = setup(true);
      await expect(service.create({ kind: "custom", name: "Local", baseUrl: `http://localhost:${port}/v1`, apiKey: fakeKey })).rejects.toBeInstanceOf(BadRequestException);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("does not follow a local discovery redirect with the default fetcher", async () => {
    let requests = 0;
    const server: Server = createServer((_req, res) => {
      requests += 1;
      res.writeHead(302, { location: "http://127.0.0.1:1/redirect-target" });
      res.end("redirect");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { service } = setup(true);
      const created = await service.create({ kind: "custom", name: "Local", baseUrl: `http://localhost:${port}/v1`, allowLocal: true, apiKey: fakeKey });
      expect(created.discoveryMessage).toMatch(/redirecionou/i);
      expect(requests).toBe(1);
      expect(JSON.stringify(created)).not.toContain(fakeKey);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("rejects local hosts without explicit allowance before making a request", async () => {
    const { service } = setup();
    const fetcher = jest.fn(async () => new Response("", { status: 200 }));
    service.setTestDependencies(fetcher);
    await expect(service.create({ kind: "custom", name: "Local", baseUrl: "http://localhost:11434/v1", apiKey: fakeKey })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetcher).not.toHaveBeenCalled();
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
  it("validates enabled provider references and catalog models for agent routing", async () => {
    const { service } = setup();
    const created = await service.create({ kind: "openai", name: "OpenAI falso", apiKey: fakeKey });
    await expect(service.validateAgentTarget(created.id, "gpt-4o-mini")).resolves.toBeUndefined();
    await expect(service.validateAgentTarget("123e4567-e89b-42d3-a456-426614174099", "gpt-4o-mini")).rejects.toMatchObject({ status: 400 });
    await expect(service.validateAgentTarget(created.id, "modelo-fora-do-catalogo")).rejects.toMatchObject({ status: 400 });
    await service.patch(created.id, { enabled: false });
    await expect(service.validateAgentTarget(created.id, "gpt-4o-mini")).rejects.toMatchObject({ status: 400 });
  });
});
