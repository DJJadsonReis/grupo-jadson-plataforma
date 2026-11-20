import { BadRequestException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ResponsibilitiesService, nextResponsibilityRun, validateResponsibilityInput } from "./responsibilities.service";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";
import { MAX_RESPONSIBILITY_FAILURE_STREAK } from "./responsibilities.service";

const baseInput = { name: "Resumo", instructions: "Resuma os avisos", agentId: "00000000-0000-4000-8000-000000000001", intervalMinutes: 60 };
const agent = { id: baseInput.agentId, name: "Bot", enabled: true, ownerId: "owner", instructions: "Seja útil", model: "", provider: "openai", generationConfig: {}, toolsAllowed: ["tempo.agora"] };

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function harness(options: { dailyCount?: number; failureStreak?: number; modelResponse?: () => Response; queryFailure?: boolean; concurrent?: boolean; accessible?: boolean; activeCount?: number } = {}) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const runUpdate: unknown[][] = [];
  let dayCount = options.dailyCount ?? 0;
  let didClaim = false;
  const pool = { query: jest.fn(async (sql: string, params?: unknown[]) => {
    queries.push({ sql, ...(params ? { params } : {}) });
    if (sql.includes("FOR UPDATE SKIP LOCKED")) {
      if (options.concurrent && didClaim) return { rows: [], rowCount: 0 };
      didClaim = true;
      return { rows: [{ id: "responsibility-1", ownerId: "owner", agentId: agent.id, name: "Resumo", instructions: "Resuma", intervalMinutes: 60, failureStreak: options.failureStreak ?? 0, runsToday: dayCount, runsDay: "2026-11-20", claimToken: "claim-1" }], rowCount: 1 };
    }
    if (sql.includes("count(*)::int AS count FROM responsibilities")) return { rows: [{ count: options.activeCount ?? 0 }], rowCount: 1 };
    if (sql.includes("SET runs_today=CASE")) {
      if (dayCount >= 6) return { rows: [], rowCount: 0 };
      dayCount += 1; return { rows: [{ runs_today: dayCount }], rowCount: 1 };
    }
    if (sql.includes("SET last_run_at=$3,last_status=$4")) {
      runUpdate.push(params ?? []);
      if (options.queryFailure) throw new Error("database failure");
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET last_run_at=$3,last_status='failed'")) return { rows: [{ failure_streak: MAX_RESPONSIBILITY_FAILURE_STREAK, enabled: false }], rowCount: 1 };
    return { rows: [{ next: null }], rowCount: 1 };
  }) };
  const database = { getPool: () => pool, isReady: () => true } as unknown as DatabaseService;
  const model = jest.fn(async () => options.modelResponse?.() ?? sse([{ choices: [{ delta: { content: "Tudo certo." } }] }]));
  const invokes = jest.fn(async () => ({ output: { agora: "hoje" }, status: "done" }));
  const maskedValue = "super-secret-value";
  const tools = { catalog: () => TOOL_DEFINITIONS, invoke: invokes, maskSecretText: async (value: string) => value.replace(maskedValue, "[mascarado]") };
  const audit = { record: jest.fn(async () => undefined) };
  const notifications = { create: jest.fn(async () => undefined) };
  const service = new ResponsibilitiesService(
    database,
    { get: jest.fn(async () => agent) } as never,
    { access: jest.fn(async () => options.accessible === false ? "none" : "owner") } as never,
    { stream: model } as never,
    tools as never,
    { decisionFor: jest.fn(async () => null) } as never,
    audit as never,
    notifications as never,
    { loadPromptSkills: jest.fn(async () => []) } as never,
  );
  return { service, pool, queries, runUpdate, model, invokes, audit, notifications, getDayCount: () => dayCount };
}

describe("responsibilities validation", () => {
  it("enforces the interval and required text", () => {
    expect(nextResponsibilityRun(new Date("2026-11-20T10:00:00Z"), 60).toISOString()).toBe("2026-11-20T11:00:00.000Z");
    for (const intervalMinutes of [59, 1441]) expect(() => validateResponsibilityInput({ ...baseInput, intervalMinutes })).toThrow(BadRequestException);
    for (const invalid of [{ ...baseInput, name: "  " }, { ...baseInput, instructions: " " }, { ...baseInput, agentId: "invalid" }]) {
      expect(() => validateResponsibilityInput(invalid)).toThrow(BadRequestException);
    }
  });

  it("rejects an inaccessible bot and the sixth active responsibility", async () => {
    const inaccessible = harness({ accessible: false });
    await expect(inaccessible.service.create("owner", baseInput)).rejects.toMatchObject({ response: { code: "INVALID_RESPONSIBILITY" } });
    const full = harness({ activeCount: 5 });
    await expect(full.service.create("owner", baseInput)).rejects.toMatchObject({ response: { code: "RESPONSIBILITY_LIMIT" } });
  });
});

describe("responsibilities execution", () => {
  it("skips the seventh run for the civil day without calling the model", async () => {
    const test = harness({ dailyCount: 6 });
    await test.service.tick(new Date("2026-11-20T12:00:00Z"));
    expect(test.model).not.toHaveBeenCalled();
    expect(test.runUpdate).toHaveLength(0);
    expect(test.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "responsibility.skipped", details: { status: "skipped_daily_limit" } }));
    expect(test.queries.some(({ sql }) => sql.includes("skipped_daily_limit"))).toBe(true);
  });

  it("masks model text before it is saved or notified", async () => {
    const test = harness({ modelResponse: () => sse([{ choices: [{ delta: { content: "O segredo é super-secret-value" } }] }]) });
    await test.service.tick(new Date("2026-11-20T12:00:00Z"));
    expect(test.runUpdate[0]?.[4]).toBe("O segredo é [mascarado]");
    expect(test.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ body: "O segredo é [mascarado]" }));
  });

  it("never invokes a sensitive tool and records needs_approval", async () => {
    const sensitiveCall = { index: 0, id: "call-1", type: "function", function: { name: "memoria__apagar_tudo", arguments: "{}" } };
    const test = harness({ modelResponse: () => sse([{ choices: [{ delta: { tool_calls: [sensitiveCall] } }] }]) });
    await test.service.tick(new Date("2026-11-20T12:00:00Z"));
    expect(test.invokes).not.toHaveBeenCalled();
    expect(test.runUpdate[0]?.[3]).toBe("needs_approval");
    expect(test.runUpdate[0]?.[4]).toBe("Esta ação precisa de aprovação e não roda em responsabilidades.");
  });

  it("turns off after five consecutive failures and notifies the owner", async () => {
    const test = harness({ failureStreak: MAX_RESPONSIBILITY_FAILURE_STREAK - 1, modelResponse: () => { throw new Error("falha"); } });
    await test.service.tick(new Date("2026-11-20T12:00:00Z"));
    expect(test.runUpdate[0]?.[6]).toBe(MAX_RESPONSIBILITY_FAILURE_STREAK);
    expect(test.runUpdate[0]?.[7]).toContain("Desligada após 5 falhas");
    expect(test.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "responsibility.disabled", owner: "owner" }));
    expect(test.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "responsibility.disabled" }));
  });

  it("uses a persisted claim so a concurrent tick cannot execute twice", async () => {
    const test = harness({ concurrent: true });
    await Promise.all([test.service.tick(new Date("2026-11-20T12:00:00Z")), test.service.tick(new Date("2026-11-20T12:00:00Z"))]);
    expect(test.pool.query.mock.calls.filter(([sql]) => String(sql).includes("FOR UPDATE SKIP LOCKED"))).toHaveLength(2);
    expect(test.model).toHaveBeenCalledTimes(1);
  });
});
