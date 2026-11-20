import { readFileSync } from "node:fs";
import { migrationId as previousMigrationId } from "./034-usage-owner";
import { migrationId, up } from "./035-notifications-kinds";

describe("035-notifications-kinds migration", () => {
  it("follows 034", () => expect(Number(migrationId.slice(0, 3))).toBe(Number(previousMigrationId.slice(0, 3)) + 1));

  it("uses exactly the NotificationKind values and can be reapplied", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    await up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    const migrationKinds = [...String(query.mock.calls[1][0]).matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]);
    const typeSource = readFileSync(require.resolve("../../notifications/notifications.service"), "utf8");
    const typeMatch = typeSource.match(/export type NotificationKind = ([^;]+);/);
    expect(typeMatch).not.toBeNull();
    const typeKinds = [...(typeMatch?.[1] ?? "").matchAll(/"([a-z_.]+)"/g)].map((match) => match[1]);
    expect(migrationKinds).toEqual(typeKinds);
    expect(query).toHaveBeenCalledTimes(4);
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS notifications_kind_check");
  });
});
