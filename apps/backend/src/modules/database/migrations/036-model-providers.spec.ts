import { migrationId, up } from "./036-model-providers";

describe("036-model-providers migration", () => {
  it("creates the encrypted provider table idempotently", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(migrationId).toBe("036-model-providers");
    expect(sql).toContain("secret_ciphertext text NOT NULL");
    expect(sql).toContain("kind IN ('openai','anthropic','gemini','xai','custom')");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
  });
});
