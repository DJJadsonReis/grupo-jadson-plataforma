import { Pool } from "pg";
import { up } from "./027-skills-ferramentas";

describe("skill tools migration", () => {
  it("adds the tools list idempotently without dropping data", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await up({ query } as unknown as Pool);
    expect(query).toHaveBeenCalledWith("ALTER TABLE skills ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}'");
    expect(query.mock.calls[0][0]).not.toMatch(/\bDROP\b/i);
  });
});
