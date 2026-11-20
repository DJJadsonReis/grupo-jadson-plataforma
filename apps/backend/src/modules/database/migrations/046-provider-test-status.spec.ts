import { up } from "./046-provider-test-status";

describe("046-provider-test-status", () => {
  it("adds nullable last test columns idempotently without deleting data", async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    await up({ query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toContain("ADD COLUMN IF NOT EXISTS last_test_status text NULL");
    expect(query.mock.calls[1]![0]).toContain("ADD COLUMN IF NOT EXISTS last_test_at timestamptz NULL");
    expect(query.mock.calls.join(" ")).not.toMatch(/\b(DROP|DELETE\s+FROM)\b/i);
  });
});
