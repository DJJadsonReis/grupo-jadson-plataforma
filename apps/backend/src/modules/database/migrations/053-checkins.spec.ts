import { readFileSync } from "node:fs";
import { migrationId as previousMigrationId } from "./052-task-notification-kinds";
import { migrationId, up } from "./053-checkins";

describe("053-checkins migration", () => {
  it("follows 052 and reapplies idempotently with supported notification kinds", async () => {
    expect(Number(migrationId.slice(0, 3))).toBe(Number(previousMigrationId.slice(0, 3)) + 1);
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never); await up({ query } as never);
    expect(query.mock.calls.map(([sql]) => String(sql)).join("\n")).toContain("CREATE TABLE IF NOT EXISTS checkin_suggestions");
    expect(query).toHaveBeenCalledTimes(12);
    const source = readFileSync(require.resolve("../../notifications/notifications.service"), "utf8");
    expect(source.match(/export type NotificationKind = ([^;]+);/)?.[1]).toContain('"checkin.message"');
  });
});
