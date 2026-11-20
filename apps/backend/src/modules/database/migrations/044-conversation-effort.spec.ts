import { migrationId, up } from "./044-conversation-effort";

describe("044-conversation-effort migration", () => {
  it("adds nullable effort with an allowed-value check and no destructive SQL", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([value]) => String(value)).join("\n");
    expect(migrationId).toBe("044-conversation-effort");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS reasoning_effort text NULL");
    expect(sql).toContain("reasoning_effort IS NULL OR reasoning_effort IN ('baixo','medio','alto')");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b/i);
  });
});
