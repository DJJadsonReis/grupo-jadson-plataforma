import { Pool } from "pg";
import { up } from "./002-conversation-agent-link";

describe("conversation agent link migration", () => {
  it("adds only a nullable relationship and index without dropping conversation data", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await up({ query } as unknown as Pool);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL");
    expect(query.mock.calls[1]?.[0]).toContain("CREATE INDEX IF NOT EXISTS conversations_agent_updated_idx");
  });
});
