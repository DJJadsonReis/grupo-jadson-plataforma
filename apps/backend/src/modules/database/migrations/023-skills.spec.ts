import { Pool } from "pg";
import { up } from "./023-skills";

describe("skills migration", () => {
  it("creates an additive table with owner-scoped unique slugs and can run repeatedly", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await up(pool);
    await up(pool);

    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS skills");
      expect(sql).toContain("owner_id text NOT NULL");
      expect(sql).toContain("UNIQUE (owner_id, slug)");
      expect(sql).not.toMatch(/\bDROP\b|\bALTER\b/i);
    }
  });
});
