import { migrationId, up } from "./037-agent-model-routing";

describe("037-agent-model-routing migration", () => {
  it("adds the routing JSON with an empty compatibility default", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    expect(migrationId).toBe("037-agent-model-routing");
    expect(String(query.mock.calls[0]?.[0])).toContain("ADD COLUMN IF NOT EXISTS model_routing jsonb NOT NULL DEFAULT '{}'::jsonb");
  });
});
