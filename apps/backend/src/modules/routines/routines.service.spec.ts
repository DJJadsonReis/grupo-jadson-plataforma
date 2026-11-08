import { BadRequestException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ToolsService } from "../tools/tools.service";
import { nextRunFrom, RoutinesService } from "./routines.service";

describe("nextRunFrom", () => {
  const now = new Date("2026-11-08T10:00:00Z");

  it("soma o intervalo em minutos", () => {
    expect(nextRunFrom(now, 15).toISOString()).toBe("2026-11-08T10:15:00.000Z");
  });

  it("recusa intervalo fora de 1 a 1440 minutos ou fracionado", () => {
    expect(() => nextRunFrom(now, 0)).toThrow(BadRequestException);
    expect(() => nextRunFrom(now, 1441)).toThrow(BadRequestException);
    expect(() => nextRunFrom(now, 2.5)).toThrow(BadRequestException);
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
  it("roda só as rotinas vencidas e registra o resultado", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes("WHERE enabled = true")) return { rows: [{ id: "r1", name: "clima", tool: "tempo.agora", intervalMinutes: 30 }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    };
    const invoked: string[] = [];
    const tools = { invoke: async (name: string, _input: unknown, by: string) => { invoked.push(`${name}|${by}`); return {}; } } as unknown as ToolsService;
    const service = new RoutinesService({ getPool: () => pool, isReady: () => true } as unknown as DatabaseService, tools);
    expect(await service.tick(new Date())).toBe(1);
    expect(invoked).toEqual(["tempo.agora|rotina:clima"]);
    expect(queries.some((text) => text.startsWith("UPDATE routines"))).toBe(true);
  });

  it("não roda nada enquanto o banco não está pronto", async () => {
    const service = new RoutinesService({ getPool: () => ({}), isReady: () => false } as unknown as DatabaseService, {} as ToolsService);
    expect(await service.tick()).toBe(0);
  });
});
