import { IntegrationsService } from "./integrations.service";

describe("IntegrationsService — migração de chave em texto puro", () => {
  const original = process.env.CREDENTIAL_KEY;
  beforeAll(() => {
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 9).toString("base64");
  });
  afterAll(() => {
    if (original === undefined) delete process.env.CREDENTIAL_KEY;
    else process.env.CREDENTIAL_KEY = original;
  });

  it("regrava cifrada uma chave antiga e devolve o valor correto", async () => {
    const writes: unknown[][] = [];
    const rows = [{ secret: "tvly-antiga-em-texto" }];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.startsWith("UPDATE")) {
          writes.push(params ?? []);
          rows[0] = { secret: String(params?.[1]) };
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: rows.length, rows };
      },
    };
    const service = new IntegrationsService({ getPool: () => pool } as never);
    const value = await service.secret("tavily");
    expect(value).toBe("tvly-antiga-em-texto");
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[1])).toMatch(/^v1:/);
    expect(await service.secret("tavily")).toBe("tvly-antiga-em-texto");
    expect(writes).toHaveLength(1);
  });
});
