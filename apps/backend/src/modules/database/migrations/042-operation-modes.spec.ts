import { migrationId, up } from "./042-operation-modes";

describe("042-operation-modes migration", () => {
  it("persists conversation override and agent default with checks for all modes", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([value]) => String(value)).join("\n");
    expect(migrationId).toBe("042-operation-modes");
    expect(sql).toContain("conversations ADD COLUMN IF NOT EXISTS operation_mode text NULL");
    expect(sql).toContain("agents ADD COLUMN IF NOT EXISTS default_operation_mode text NOT NULL DEFAULT 'automatico'");
    expect(sql.match(/ignorar_permissoes/g)).toHaveLength(2);
  });
});
