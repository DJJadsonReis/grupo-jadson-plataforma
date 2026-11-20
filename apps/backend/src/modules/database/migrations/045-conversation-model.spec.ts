import { up } from "./045-conversation-model";

describe("045-conversation-model", () => {
  it("adds nullable model choice columns with a provider FK that sets null on delete", async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    await up({ query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toContain("model_provider_id uuid NULL REFERENCES model_providers(id) ON DELETE SET NULL");
    expect(query.mock.calls[0]![0]).toContain("IF NOT EXISTS");
    expect(query.mock.calls[1]![0]).toContain("ADD COLUMN IF NOT EXISTS model text NULL");
    expect(query.mock.calls.join(" ")).not.toMatch(/\b(DROP|DELETE\s+FROM)\b/i);
  });
});
