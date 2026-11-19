import { BadRequestException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ToolsService } from "../tools/tools.service";
import { nextRunFrom, RoutinesService } from "./routines.service";

describe("nextRunFrom", () => {
  const now = new Date("2026-11-08T10:00:00Z");

  it("soma o intervalo em minutos", () => {
    expect(nextRunFrom(now, 15).toISOString()).toBe("2026-11-08T10:15:00.000Z");
  });

  it("recusa intervalo abaixo de 15 minutos, acima de 1440 ou fracionado", () => {
    expect(() => nextRunFrom(now, 1)).toThrow(BadRequestException);
    expect(() => nextRunFrom(now, 14)).toThrow(BadRequestException);
    expect(() => nextRunFrom(now, 1441)).toThrow(BadRequestException);
    expect(() => nextRunFrom(now, 15.5)).toThrow(BadRequestException);
  });

  it("aceita o intervalo mínimo de 15 minutos", () => {
    expect(nextRunFrom(now, 15).toISOString()).toBe("2026-11-08T10:15:00.000Z");
  });
});

describe("limites de rotinas", () => {
  const catalog = [{ name: "tempo.agora", description: "", risk: "read" }];

  it("recusa criar mais uma rotina quando já há 20 ativas", async () => {
    const pool = {
      query: async (text: string) => (text.includes("count(*)") ? { rows: [{ n: 20 }], rowCount: 1 } : { rows: [], rowCount: 0 }),
    };
    const service = new RoutinesService({ getPool: () => pool } as unknown as DatabaseService, { catalog: () => catalog } as unknown as ToolsService);
    await expect(service.create({ name: "x", tool: "tempo.agora", intervalMinutes: 60 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa ligar uma rotina quando já há 20 ativas", async () => {
    const pool = {
      query: async (text: string) => (text.includes("count(*)") ? { rows: [{ n: 20 }], rowCount: 1 } : { rows: [], rowCount: 1 }),
    };
    const service = new RoutinesService({ getPool: () => pool } as unknown as DatabaseService, {} as ToolsService);
    await expect(service.setEnabled("r1", true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("desligar uma rotina não passa pelo teto", async () => {
    const pool = { query: async () => ({ rows: [{ id: "r1" }], rowCount: 1 }) };
    const service = new RoutinesService({ getPool: () => pool } as unknown as DatabaseService, {} as ToolsService);
    await expect(service.setEnabled("r1", false)).resolves.toBeDefined();
  });

  it("envia ao banco o status de falha e o limite de 10 falhas seguidas", async () => {
    const updates: unknown[][] = [];
    const pool = {
      query: async (text: string, params?: unknown[]) => {
        if (text.includes("WHERE enabled = true AND next_run_at")) {
          return { rows: [{ id: "r1", name: "clima", tool: "tempo.agora", intervalMinutes: 15 }], rowCount: 1 };
        }
        if (text.startsWith("UPDATE routines")) updates.push(params ?? []);
        return { rows: [], rowCount: 1 };
      },
    };
    const tools = { invoke: async () => { throw new Error("falha simulada"); }, maskSecretText: async (text: string) => text } as unknown as ToolsService;
    const service = new RoutinesService({ getPool: () => pool, isReady: () => true } as unknown as DatabaseService, tools);
    await service.tick(new Date());
    // Parâmetro $3 = status ("failed") e $5 = limite de falhas seguidas
    expect(updates[0]?.[2]).toBe("failed");
    expect(updates[0]?.[4]).toBe(10);
  });
});

describe("RoutinesService.create", () => {
  const catalog = [
    { name: "tempo.agora", description: "", risk: "read" },
    { name: "memoria.apagar_tudo", description: "", risk: "sensitive" },
  ];
  const service = new RoutinesService(
    { getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }) } as unknown as DatabaseService,
    { catalog: () => catalog } as unknown as ToolsService,
  );

  it("não agenda ferramenta sensível", async () => {
    await expect(service.create({ name: "x", tool: "memoria.apagar_tudo", intervalMinutes: 60 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("não agenda ferramenta inexistente", async () => {
    await expect(service.create({ name: "x", tool: "shell.executar", intervalMinutes: 60 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("RoutinesService.tick", () => {
  it("consulta disparos vencidos no PostgreSQL para retomar depois do boot", async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = new RoutinesService({ getPool: () => ({ query }), isReady: () => true } as unknown as DatabaseService, {} as ToolsService);
    await service.tick(new Date("2026-11-19T12:00:00Z"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("next_run_at <= $1"), expect.arrayContaining([new Date("2026-11-19T12:00:00Z")]));
  });
  it("roda só as rotinas vencidas e registra o resultado", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes("FOR UPDATE SKIP LOCKED")) return { rows: [{ id: "r1", name: "clima", tool: "tempo.agora", intervalMinutes: 30, claimToken: "claim-1" }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    };
    const invoked: string[] = [];
    const tools = { invoke: async (name: string, _input: unknown, by: string) => { invoked.push(`${name}|${by}`); return {}; } } as unknown as ToolsService;
    const service = new RoutinesService({ getPool: () => pool, isReady: () => true } as unknown as DatabaseService, tools);
    expect(await service.tick(new Date())).toBe(1);
    expect(invoked).toEqual(["tempo.agora|rotina:clima"]);
    expect(queries.some((text) => text.includes("claim_until = NULL"))).toBe(true);
  });

  it("duas instâncias concorrentes só executam o disparo que ganhou o claim PostgreSQL", async () => {
    let claimed = false;
    const query = async (text: string) => {
      if (text.includes("FOR UPDATE SKIP LOCKED")) {
        if (claimed) return { rows: [], rowCount: 0 };
        claimed = true;
        return { rows: [{ id: "r1", name: "clima", tool: "tempo.agora", intervalMinutes: 30, claimToken: "claim-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    };
    const invoke = jest.fn(async () => ({}));
    const tools = { invoke, maskSecretText: async (message: string) => message } as unknown as ToolsService;
    const db = { getPool: () => ({ query }), isReady: () => true } as unknown as DatabaseService;
    const first = new RoutinesService(db, tools);
    const second = new RoutinesService(db, tools);
    await Promise.all([first.tick(new Date()), second.tick(new Date())]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("não roda nada enquanto o banco não está pronto", async () => {
    const service = new RoutinesService({ getPool: () => ({}), isReady: () => false } as unknown as DatabaseService, {} as ToolsService);
    expect(await service.tick()).toBe(0);
  });
});
