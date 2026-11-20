import { Pool } from "pg";
import { up } from "./026-skills-globais";

describe("global skills migration", () => {
  it("adds the global flag idempotently without dropping data", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await up({ query } as unknown as Pool);
    expect(query).toHaveBeenCalledWith("ALTER TABLE skills ADD COLUMN IF NOT EXISTS global boolean NOT NULL DEFAULT false");
    expect(query.mock.calls[0][0]).not.toMatch(/\bDROP\b/i);
  });
});
