import { ModelProvidersService } from "./model-providers.service";

describe("provider status flow (fake upstream)", () => {
  it("registers four providers, saves each result, lists statuses and removes one", async () => {
    type TestRecord = Record<string, any> & { availability: Record<string, unknown>[] };
    const records = new Map<string, TestRecord>();
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO model_providers")) {
        const [id, kind, name, baseUrl, secretCiphertext, modelsJson, lastTestStatus] = values;
        const row: TestRecord = { id, kind, name, baseUrl, secretCiphertext, models: JSON.parse(String(modelsJson)), lastTestStatus, lastTestAt: new Date(), enabled: true, createdAt: new Date(), updatedAt: new Date(), availability: [] };
        records.set(String(id), row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("SELECT model_id,status,checked_at")) {
        const row = records.get(String(values[0]));
        return { rows: row?.availability ?? [], rowCount: row?.availability.length ?? 0 };
      }
      if (sql.startsWith("INSERT INTO model_availability")) {
        const [providerId, modelId, status] = values;
        const row = records.get(String(providerId))!;
        const old = row.availability.find((item) => item.model_id === modelId);
        if (old) Object.assign(old, { status, checked_at: new Date() });
        else row.availability.push({ model_id: modelId, status, checked_at: new Date() });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id,kind,name,base_url")) {
        const selected = sql.includes("WHERE id=$1") ? [records.get(String(values[0]))].filter(Boolean) : [...records.values()];
        return { rows: selected, rowCount: selected.length };
      }
      if (sql.startsWith("SELECT name FROM integrations")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE model_providers SET models_json=$2,last_test_status=$3")) {
        const row = records.get(String(values[0]))!;
        Object.assign(row, { models: JSON.parse(String(values[1])), lastTestStatus: values[2], lastTestAt: new Date() });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE model_providers SET last_test_status=$2")) {
        const row = records.get(String(values[0]))!;
        Object.assign(row, { lastTestStatus: values[1], lastTestAt: new Date() });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("DELETE FROM model_providers")) return { rows: [], rowCount: records.delete(String(values[0])) ? 1 : 0 };
      throw new Error(`unexpected query: ${sql}`);
    });

    const service = new ModelProvidersService({ getPool: () => ({ query }) } as never);
    service.setTestSecretBox({ encrypt: (value: string) => `encrypted:${value}`, decrypt: (value: string) => value.slice("encrypted:".length) } as never);
    const fakeKey = "chave-falsa-provider-93";
    let nextResponse: Response = new Response(JSON.stringify({ data: [{ id: "fake-model" }] }), { status: 200 });
    service.setTestDependencies(jest.fn(async () => nextResponse), async () => ["8.8.8.8"]);

    const created = [];
    for (const input of [
      { kind: "xai", name: "xAI falso", apiKey: fakeKey },
      { kind: "gemini", name: "Gemini falso", apiKey: fakeKey },
      { kind: "custom", name: "OpenRouter falso", baseUrl: "http://127.0.0.1:9001/v1", allowLocal: true, apiKey: fakeKey },
      { kind: "custom", name: "NVIDIA falso", baseUrl: "http://localhost:9002/v1", allowLocal: true, apiKey: fakeKey },
    ] as const) created.push(await service.create(input));

    for (const [index, response] of [
      new Response(JSON.stringify({ data: [{ id: "xai-model" }] }), { status: 200 }),
      new Response("{}", { status: 401 }),
      new Response("{}", { status: 429 }),
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ].entries()) {
      nextResponse = response;
      await service.test(created[index]!.id);
    }

    const listed = await service.list();
    expect(listed.map(({ name, keyStatus }) => [name, keyStatus])).toEqual([
      ["xAI falso", "valida"], ["Gemini falso", "invalida"], ["OpenRouter falso", "limite_atingido"], ["NVIDIA falso", "sem_modelos"],
    ]);
    expect(listed.every((item) => item.lastTestAt instanceof Date)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(fakeKey);

    await service.remove(created[1]!.id);
    const remaining = await service.list();
    expect(remaining.map((item) => item.name)).toEqual(["xAI falso", "OpenRouter falso", "NVIDIA falso"]);
    expect(remaining.map((item) => item.keyStatus)).toEqual(["valida", "limite_atingido", "sem_modelos"]);
  });
});
