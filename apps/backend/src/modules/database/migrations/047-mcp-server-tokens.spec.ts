import { up } from "./047-mcp-server-tokens";

describe("047-mcp-server-tokens", () => {
  it("creates the token table and owner index idempotently without deleting data", async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    await up({ query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toContain("CREATE TABLE IF NOT EXISTS mcp_server_tokens");
    expect(query.mock.calls[1]![0]).toContain("CREATE INDEX IF NOT EXISTS");
    expect(query.mock.calls.join(" ")).not.toMatch(/\b(DROP|DELETE\s+FROM)\b/i);
  });
});
