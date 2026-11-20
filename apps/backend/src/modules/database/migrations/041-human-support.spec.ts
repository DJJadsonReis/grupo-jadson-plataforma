import { migrationId, up } from "./041-human-support";

describe("041-human-support migration", () => {
  it("creates the request queue and explicit attendant access table", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    expect(migrationId).toBe("041-human-support");
    expect(query.mock.calls.map(([sql]) => String(sql)).join("\n")).toContain("human_support_attendants");
    expect(query.mock.calls.map(([sql]) => String(sql)).join("\n")).toContain("status IN ('aberto','assumido','resolvido')");
  });
});
