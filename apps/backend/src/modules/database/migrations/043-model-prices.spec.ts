import { migrationId, up } from "./043-model-prices";

describe("043-model-prices migration", () => {
  it("creates a nonnegative price table keyed by provider and model without destructive SQL", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = query.mock.calls.map(([value]) => String(value)).join("\n");
    expect(migrationId).toBe("043-model-prices");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS model_prices");
    expect(sql).toContain("input_usd_per_million numeric(12,4) NOT NULL CHECK (input_usd_per_million >= 0)");
    expect(sql).toContain("output_usd_per_million numeric(12,4) NOT NULL CHECK (output_usd_per_million >= 0)");
    expect(sql).toContain("PRIMARY KEY (provider, model)");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b/i);
  });
});
