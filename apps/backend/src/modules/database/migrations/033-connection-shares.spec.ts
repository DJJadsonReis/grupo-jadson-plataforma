import { migrationId as previousMigrationId } from "./032-team-rooms";
import { migrationId, up } from "./033-connection-shares";

describe("033-connection-shares migration", () => {
  it("follows 032", () => expect(Number(migrationId.slice(0, 3))).toBe(Number(previousMigrationId.slice(0, 3)) + 1));
  it("creates safe schema and required checks", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS google_connection_shares");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toContain("status IN ('pending','approved')");
    expect(sql).toContain("CHECK (owner_id <> grantee_id)");
    expect(sql).not.toMatch(/\bDROP\b|\bALTER\b/i);
  });
});
