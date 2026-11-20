import { createHash } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { McpServerTokensService } from "./mcp-server-tokens.service";

describe("McpServerTokensService", () => {
  it("stores only a SHA-256 digest and returns the token only from create", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: "id-1", name: "Cursor", createdAt: "now", lastUsedAt: null, revokedAt: null }], rowCount: 1 });
    const service = new McpServerTokensService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    const result = await service.create("person-a", "Cursor");
    expect(result.token.startsWith("gjm_")).toBe(true);
    expect(result.token.length).toBe(47);
    expect(result.token.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(query.mock.calls[0]?.[1]).toContain(createHash("sha256").update(result.token).digest("hex"));
    expect(query.mock.calls[0]?.[1]).not.toContain(result.token);
  });

  it("lists safe columns and revokes only a row owned by the caller", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: "1", name: "Editor", createdAt: "now", lastUsedAt: null, revokedAt: null }] }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const service = new McpServerTokensService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    const listed = await service.list("person-a");
    expect(listed[0]).not.toHaveProperty("token_hash");
    expect(query.mock.calls[0]?.[0]).not.toContain("token_hash");
    await expect(service.revoke("person-a", "1")).resolves.toBe(true);
    expect(query.mock.calls[1]?.[0]).toContain("revoked_at=COALESCE(revoked_at,now())");
    expect(query.mock.calls[1]?.[1]).toEqual(["1", "person-a"]);
  });

  it("resolves only active tokens by their digest", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ ownerId: "person-a", tokenId: "token-abcdef" }] }).mockResolvedValueOnce({ rows: [] });
    const service = new McpServerTokensService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    const first = "gjm_test-value";
    await expect(service.resolve(first)).resolves.toEqual({ ownerId: "person-a", tokenId: "token-abcdef" });
    expect(query.mock.calls[0]?.[1]).toEqual([createHash("sha256").update(first).digest("hex")]);
    await expect(service.resolve("not-mcp")).resolves.toBeNull();
  });
});
