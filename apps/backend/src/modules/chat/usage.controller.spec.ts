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
    const calls: string[] = [];
    const usage = {
      summaryByAgent: async (since: string) => {
        calls.push(since);
        return [{ agentId: null, totalTokens: 10, calls: 1 }];
      },
    } as unknown as UsageService;
    const controller = new UsageController(usage);
    const before = Date.now();
    const result = await controller.summary("7");
    expect(result.days).toBe(7);
    expect(result.agents).toHaveLength(1);
    const sinceMs = Date.parse(calls[0] ?? "");
    expect(before - sinceMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
  });
});
