import { migrationId, up } from "./038-provider-discovered-models";

describe("038-provider-discovered-models migration", () => {
  it("adds a non-null array of discovered models idempotently", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    expect(migrationId).toBe("038-provider-discovered-models");
    expect(String(query.mock.calls[0]?.[0])).toContain("ADD COLUMN IF NOT EXISTS models_json jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(String(query.mock.calls[1]?.[0])).toContain("CHECK (jsonb_typeof(models_json) = 'array')");
  });
});
