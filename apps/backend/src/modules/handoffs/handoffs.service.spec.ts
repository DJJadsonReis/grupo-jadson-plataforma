import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MAX_HANDOFF_DEPTH, HandoffsService, buildHandoffContext, nextHandoffDepth } from "./handoffs.service";
import { randomUUID } from "node:crypto";

describe("nextHandoffDepth", () => {
  it("soma uma delegação até o limite", () => {
    expect(nextHandoffDepth(0)).toBe(1);
    expect(nextHandoffDepth(MAX_HANDOFF_DEPTH - 1)).toBe(MAX_HANDOFF_DEPTH);
  });

  it("recusa a delegação que passaria do limite", () => {
    expect(() => nextHandoffDepth(MAX_HANDOFF_DEPTH)).toThrow(BadRequestException);
  });

  it("respeita um limite diferente quando informado", () => {
    expect(() => nextHandoffDepth(1, 1)).toThrow(BadRequestException);
    expect(nextHandoffDepth(0, 1)).toBe(1);
  });
});

describe("HandoffsService", () => {
  const owner = { id: "owner", name: "Owner", role: "operator" as const };
  const setup = (overrides: Record<string, unknown> = {}) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("SELECT 1 FROM conversations")) return { rowCount: overrides.owner === false ? 0 : 1, rows: [{}] };
      if (sql.includes("SELECT role,content")) return { rowCount: 2, rows: [{ role: "user", content: "Oi" }, { role: "assistant", content: "Olá" }] };
      if (sql.includes("MAX(depth)")) return { rowCount: 1, rows: [{ depth: 0 }] };
      if (sql.includes("INSERT INTO handoffs")) return { rowCount: 1, rows: [{ id: "h1", conversationId: "c1", fromAgentId: null, toAgentId: "a2", reason: "revisão", depth: 1, createdAt: "now", context: "user: Oi\nassistant: Olá\nMotivo: revisão", appliedAt: null }] };
      return { rowCount: 1, rows: [{}] };
    });
    const client = { query, release: jest.fn() };
    const pool = { query, connect: async () => client };
    const service = new HandoffsService({ getPool: () => pool } as never,
      { get: async () => ({ id: "a2", name: "Destino", enabled: true }) } as never,
      { record: jest.fn(async () => undefined) } as never,
      { assertCanUse: jest.fn(async () => { if (overrides.permission === false) throw new NotFoundException(); }) } as never);
    return { service, query };
  };
  it("limita contexto a doze mensagens, 300 caracteres por mensagem e 4000 no total", () => {
    expect(buildHandoffContext(Array.from({ length: 13 }, (_, i) => ({ role: "user", content: `${i}${"x".repeat(400)}` })), "").split("\n")).toHaveLength(12);
    expect(buildHandoffContext([{ role: "user", content: "x".repeat(500) }], "").length).toBe(306);
    expect(buildHandoffContext([{ role: "user", content: "x".repeat(300) }], "y".repeat(300)).length).toBeLessThanOrEqual(4000);
  });
  it("confere dono e permissão antes de gravar", async () => {
    const notOwner = setup({ owner: false });
    await expect(notOwner.service.create({ conversationId: randomUUID(), toAgentId: "a2" }, owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(notOwner.query).toHaveBeenCalledTimes(1);
    const denied = setup({ permission: false });
    await expect(denied.service.create({ conversationId: randomUUID(), toAgentId: "a2" }, owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO handoffs"))).toBe(false);
  });
  it("grava contexto e mensagem de transição na delegação válida", async () => {
    const { service, query } = setup();
    const result = await service.create({ conversationId: randomUUID(), toAgentId: "a2", reason: " revisão " }, owner);
    expect(result.context).toContain("Motivo: revisão");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO messages") )).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO handoffs"))).toBe(true);
  });
});
