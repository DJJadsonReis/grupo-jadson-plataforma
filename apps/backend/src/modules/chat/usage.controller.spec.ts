import { clampDays, UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

describe("clampDays", () => {
  it("usa 30 dias quando o valor é inválido", () => {
    expect(clampDays(Number.NaN)).toBe(30);
  });

  it("mantém o intervalo entre 1 e 365 dias", () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-7)).toBe(1);
    expect(clampDays(9999)).toBe(365);
    expect(clampDays(14.9)).toBe(14);
  });
});

describe("UsageController.summary", () => {
  it("consulta a partir de N dias atrás e devolve o período usado", async () => {
    const calls: Array<{ owner: string | null; since: string }> = [];
    const usage = {
      summaryForOwner: async (owner: string | null, since: string) => {
        calls.push({ owner, since });
        return { byAgent: [{ agentId: null, totalTokens: 10, calls: 1, costUsd: null, callsWithoutPrice: 1 }], byConversation: [] };
      },
    } as unknown as UsageService;
    const controller = new UsageController(usage);
    const before = Date.now();
    const result = await controller.summary("7", { principal: { id: "pessoa-a", role: "operator" } });
    expect(result.days).toBe(7);
    expect(result.agents).toHaveLength(1);
    expect(calls[0]?.owner).toBe("pessoa-a");
    expect(result).not.toHaveProperty("byPerson");
    const sinceMs = Date.parse(calls[0]?.since ?? "");
    expect(before - sinceMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
  });

  it("asks the service for all owners for admins", async () => {
    const summaryForOwner = jest.fn(async () => ({ byAgent: [], byConversation: [], byPerson: [{ personId: "pessoa-a", totalTokens: 2, calls: 1, costUsd: null, callsWithoutPrice: 1 }] }));
    const controller = new UsageController({ summaryForOwner } as unknown as UsageService);
    const result = await controller.summary("30", { principal: { id: "admin", role: "admin" } });
    expect(summaryForOwner).toHaveBeenCalledWith(null, expect.any(String));
    expect(result.byPerson).toHaveLength(1);
  });
});
