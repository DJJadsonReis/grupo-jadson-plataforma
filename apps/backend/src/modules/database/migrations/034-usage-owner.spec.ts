import { migrationId as previousMigrationId } from "./033-connection-shares";
import { migrationId, up } from "./034-usage-owner";

describe("034-usage-owner migration", () => {
  it("follows 033", () => expect(Number(migrationId.slice(0, 3))).toBe(Number(previousMigrationId.slice(0, 3)) + 1));
  it("adds owner, index, and legacy backfill", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'sistema'");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS usage_events_owner_idx ON usage_events(owner_id, created_at DESC)");
    expect(sql).toContain("UPDATE usage_events u SET owner_id = c.owner_id");
    expect(sql).toContain("u.owner_id = 'sistema' AND c.owner_id <> 'sistema'");
  });
});
