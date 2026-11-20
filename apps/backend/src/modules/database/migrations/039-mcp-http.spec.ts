import { migrationId, up } from "./039-mcp-http";

describe("039-mcp-http migration", () => {
  it("adiciona campos com defaults aditivos sem modificar as linhas", async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [] }));
    await up({ query } as never);
    expect(migrationId).toBe("039-mcp-http");
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'stdio'");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT ''");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS headers_secret text NOT NULL DEFAULT ''");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });
});
