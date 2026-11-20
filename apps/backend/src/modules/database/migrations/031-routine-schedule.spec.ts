import { Pool } from "pg";
import { up } from "./031-routine-schedule";

describe("migration 031-routine-schedule", () => {
  it("adiciona a coluna de forma idempotente e restringe HH:MM", async () => {
    const query = jest.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
    await up({ query } as unknown as Pool);
    expect(query).toHaveBeenNthCalledWith(1, "ALTER TABLE routines ADD COLUMN IF NOT EXISTS daily_at text NULL");
    expect(query.mock.calls[1]?.[0]).toContain("daily_at IS NULL OR daily_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'");
  });
});
