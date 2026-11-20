import { up } from "./032-team-rooms";
import { migrationId as previousMigrationId } from "./031-routine-schedule";
import { migrationId } from "./032-team-rooms";

describe("032-team-rooms migration", () => {
  it("follows migration 031", () => {
    expect(Number(migrationId.slice(0, 3))).toBe(Number(previousMigrationId.slice(0, 3)) + 1);
  });
  it("creates idempotent tables and checks without altering existing tables", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(3);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toMatch(/char_length\(name\) BETWEEN 1 AND 80/);
    expect(sql).toContain("role IN ('admin','member')");
    expect(sql).toContain("author_kind IN ('person','bot')");
    expect(sql).toMatch(/char_length\(content\) BETWEEN 1 AND 4000/);
    expect(sql).not.toMatch(/\bDROP\b|\bALTER\b/i);
  });
});
