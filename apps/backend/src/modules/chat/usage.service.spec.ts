import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { UsageService } from "./usage.service";

describe("UsageService model prices", () => {
  it("keeps costs null and counts every call when the database has no price", async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("FROM model_prices")) return { rows: [] };
      if (sql.includes("GROUP BY u.agent_id")) return { rows: [{ groupId: "bot", provider: "fixture", model: "unknown", promptTokens: 200, completionTokens: 20, totalTokens: 220, calls: 2 }] };
      return { rows: [] };
    });
    const service = new UsageService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    const summary = await service.summaryForOwner("owner", new Date(0).toISOString());
    expect(summary.byAgent[0]).toMatchObject({ costUsd: null, callsWithoutPrice: 2 });
  });

  it("uses database prices and records writes without credential fields", async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("INSERT INTO model_prices")) return { rows: [{ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8, updatedBy: "admin", updatedAt: new Date() }], rowCount: 1 };
      if (sql.includes("DELETE FROM model_prices")) return { rows: [{ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }], rowCount: 1 };
      if (sql.includes("FROM model_prices")) return { rows: [{ provider: "fixture", model: "model", input: "2", output: "8" }] };
      if (sql.includes("GROUP BY u.agent_id")) return { rows: [{ groupId: "bot", provider: "fixture", model: "model", promptTokens: 1000, completionTokens: 500, totalTokens: 1500, calls: 1 }] };
      return { rows: [] };
    });
    const service = new UsageService({ getPool: () => ({ query }) } as unknown as DatabaseService, audit);
    const summary = await service.summaryForOwner("owner", new Date(0).toISOString());
    expect(summary.byAgent[0]?.costUsd).toBe(0.006);
    await service.setPrice({ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }, "admin");
    expect(query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO model_prices"))?.[1]).toEqual(["fixture", "model", 2, 8, "admin"]);
    await service.removePrice("fixture", "model", "admin");
    expect(audit.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "model_price.set", actor: "admin", details: expect.objectContaining({ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }) }));
    expect(audit.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "model_price.remove", actor: "admin", details: expect.objectContaining({ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }) }));
    for (const [event] of (audit.record as jest.Mock).mock.calls) expect(JSON.stringify(event)).not.toMatch(/api.?key|credential|secret/i);
  });
});
