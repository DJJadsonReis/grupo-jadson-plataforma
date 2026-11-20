import { Pool } from "pg";
import { up } from "./024-agent-skills";

describe("agent skills migration", () => {
  it("creates the additive link table idempotently with cascade deletion", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await up(pool);
    await up(pool);

    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS agent_skills");
      expect(sql).toContain("agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE");
      expect(sql).toContain("skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE");
      expect(sql).toContain("PRIMARY KEY (agent_id, skill_id)");
      expect(sql).not.toMatch(/\bDROP\b|\bALTER\b/i);
    }
  });
});
