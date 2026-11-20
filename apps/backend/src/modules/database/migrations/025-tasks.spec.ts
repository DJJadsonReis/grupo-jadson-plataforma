import { Pool } from "pg";
import { migrationId, up } from "./025-tasks";

describe("tasks migration", () => {
  it("creates the owner/status table and index idempotently", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    await up(pool);
    await up(pool);
    expect(migrationId).toBe("025-tasks");
    expect(query).toHaveBeenCalledTimes(4);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS tasks");
    expect(statements[0]).toContain("id uuid PRIMARY KEY");
    expect(statements[0]).toContain("owner_id text NOT NULL");
    expect(statements[0]).toContain("description text NOT NULL DEFAULT ''");
    expect(statements[0]).toContain("CHECK (status IN ('aberta','concluida','arquivada'))");
    expect(statements[0]).toContain("created_at timestamptz NOT NULL DEFAULT now()");
    expect(statements[0]).toContain("updated_at timestamptz NOT NULL DEFAULT now()");
    expect(statements[1]).toContain("CREATE INDEX IF NOT EXISTS");
    expect(statements[1]).toContain("ON tasks(owner_id, status)");
    for (const sql of statements) expect(sql).not.toMatch(/\bDROP\b|\bALTER\b/i);
  });
});
