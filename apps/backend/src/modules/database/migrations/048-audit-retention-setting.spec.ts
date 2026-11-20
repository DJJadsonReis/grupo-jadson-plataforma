import { up } from "./048-audit-retention-setting";

describe("048-audit-retention-setting", () => {
  it("cria a tabela singleton idempotentemente sem apagar dados", async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    await up({ query } as never);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain("CREATE TABLE IF NOT EXISTS audit_settings");
    expect(query.mock.calls[0]![0]).toContain("CHECK (id = 1)");
    expect(query.mock.calls[0]![0]).toContain("retention_days BETWEEN 1 AND 3650");
    expect(query.mock.calls.join(" ")).not.toMatch(/\b(DROP|DELETE\s+FROM)\b/i);
  });
});
