import { Pool } from "pg";
import { up } from "./003-multiagent-controller";

describe("multiagent schema migration", () => {
  it("adds profile and group structures without destructive schema operations", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await up({ query } as unknown as Pool);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.join("\n")).toContain("ADD COLUMN IF NOT EXISTS avatar");
    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS agent_groups");
    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS group_participants");
    expect(statements.join("\n")).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
