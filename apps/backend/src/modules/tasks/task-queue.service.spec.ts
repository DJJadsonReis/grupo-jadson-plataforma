import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TaskQueueService } from "./task-queue.service";
import { validatePatch } from "./tasks.service";

function setup() {
  const state = { status: "aberta", agentId: null as string | null, attempts: 0, claimToken: "token-1", result: "", failure: "", owner: "owner" };
  const notifications: unknown[] = [];
  const audits: unknown[] = [];
  const queries: string[] = [];
  const database = { isReady: () => true, getPool: () => ({ query: async (sql: string, params: unknown[] = []) => {
    queries.push(sql);
    if (sql.includes("SELECT status,agent_id")) return state.owner === params[1] ? { rowCount: 1, rows: [{ status: state.status, agentId: state.agentId, title: "Tarefa", description: "Detalhes" }] } : { rowCount: 0, rows: [] };
    if (sql.includes("SELECT id,name,role FROM users")) return { rowCount: 1, rows: [{ id: "owner", name: "Pessoa", role: "operator" }] };
    if (sql.includes("UPDATE tasks SET agent_id")) { state.status = "na_fila"; state.agentId = String(params[2]); state.attempts = 0; return { rowCount: 1, rows: [{ id: "task" }] }; }
    if (sql.includes("UPDATE tasks SET status='aberta'")) { const agentId = state.agentId; state.status = "aberta"; state.agentId = null; return { rowCount: 1, rows: [{ agentId }] }; }
    if (sql.includes("UPDATE tasks SET status='em_andamento'")) { if (state.status !== "na_fila") return { rowCount: 0, rows: [] }; state.status = "em_andamento"; state.attempts += 1; return { rowCount: 1, rows: [{ id: "task", ownerId: "owner", title: "Tarefa", description: "Detalhes", agentId: state.agentId, claimToken: state.claimToken, attempts: state.attempts }] }; }
    if (sql.includes("UPDATE tasks SET result=")) { if (String(params[1]) !== state.claimToken) return { rowCount: 0, rows: [] }; state.result = String(params[2]); state.status = "concluida"; return { rowCount: 1, rows: [{}] }; }
    if (sql.includes("UPDATE tasks SET status='na_fila'")) { if (String(params[1]) !== state.claimToken) return { rowCount: 0, rows: [] }; state.status = "na_fila"; return { rowCount: 1, rows: [] }; }
    if (sql.includes("UPDATE tasks SET status='falhou'")) { if (String(params[1]) !== state.claimToken) return { rowCount: 0, rows: [] }; state.status = "falhou"; state.failure = String(params[2]); return { rowCount: 1, rows: [{}] }; }
    if (sql.includes("FROM agents WHERE id=$1 AND enabled=true")) return { rowCount: 1, rows: [{ id: "agent", name: "Bot", enabled: true, instructions: "", provider: "openai", model: "", generationConfig: {}, providerKind: "model" }] };
    return { rowCount: 0, rows: [] };
  } }) };
  const service = new TaskQueueService(database as never, { assertCanUse: async () => "owner" } as never,
    { get: async () => ({ id: "agent", enabled: true }) } as never,
    { stream: async () => new Response('data: {"choices":[{"delta":{"content":"saída sk-12345678"}}]}\n\ndata: [DONE]\n\n') } as never,
    { secretsForMasking: async () => ["sk-12345678"] } as never,
    { create: async (value: unknown) => { notifications.push(value); } } as never,
    { record: async (value: unknown) => { audits.push(value); } } as never);
  return { service, state, notifications, audits, queries };
}

describe("TaskQueueService", () => {
  it("PATCH aceita apenas os três estados existentes", () => {
    let rejected = false;
    try { validatePatch({ status: "na_fila" }); } catch { rejected = true; }
    expect(rejected).toBe(true);
    expect(validatePatch({ status: "concluida" }).status).toBe("concluida");
  });
  it("enqueues only owned tasks with permission and audits metadata", async () => {
    const { service, state, audits } = setup();
    await service.enqueue("owner", "task", "agent");
    expect(state.status).toBe("na_fila");
    expect(audits).toHaveLength(1);
    await expect(service.enqueue("other", "task", "agent")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("rejects denied bots and invalid transitions", async () => {
    const { service, state } = setup();
    await expect(service.enqueue("owner", "task", "agent")).resolves.toBeDefined();
    await expect(service.enqueue("owner", "task", "agent")).rejects.toBeInstanceOf(ConflictException);
    state.status = "em_andamento";
    await expect(service.cancel("owner", "task")).rejects.toThrow("A tarefa já está sendo executada.");
    const denied = new TaskQueueService({ getPool: () => ({ query: async () => ({ rowCount: 1, rows: [{ status: "aberta", agentId: null }] }) }) } as never,
      { assertCanUse: async () => "none" } as never, { get: async () => ({ enabled: true }) } as never, {} as never, {} as never, {} as never, {} as never);
    await expect(denied.enqueue("owner", "task", "agent")).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("masks successful output, notifies, retries failures, and ignores stale claims", async () => {
    const { service, state, notifications } = setup();
    await service.enqueue("owner", "task", "agent");
    await service.runOnce();
    expect(state.result).toContain("[REDACTED]");
    expect(state.status).toBe("concluida");
    expect(notifications).toHaveLength(1);
    state.status = "em_andamento"; state.claimToken = "new-token";
    await service.runClaimed({ id: "task", ownerId: "owner", title: "t", description: "d", agentId: "agent", claimToken: "old-token", attempts: 3 });
    expect(state.result).toContain("[REDACTED]");
  });
  it("returns first and second failures to the queue and safely fails the third", async () => {
    const { service, state, notifications } = setup();
    await service.enqueue("owner", "task", "agent");
    const broken = new TaskQueueService({ isReady: () => true, getPool: () => ({ query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("UPDATE tasks SET status='em_andamento'")) { if (state.status !== "na_fila") return { rowCount: 0, rows: [] }; state.status = "em_andamento"; state.attempts += 1; return { rowCount: 1, rows: [{ id: "task", ownerId: "owner", title: "Tarefa", description: "Detalhes", agentId: "agent", claimToken: state.claimToken, attempts: state.attempts }] }; }
      if (sql.includes("FROM agents WHERE id=$1 AND enabled=true")) throw new Error("token secreto de erro");
      if (sql.includes("UPDATE tasks SET status='na_fila'")) { state.status = "na_fila"; return { rowCount: 1, rows: [] }; }
      if (sql.includes("UPDATE tasks SET status='falhou'")) { state.status = "falhou"; state.failure = String(params[2]); return { rowCount: 1, rows: [{}] }; }
      return { rowCount: 0, rows: [] };
    } }) } as never, {} as never, {} as never, {} as never, {} as never, { create: async (value: unknown) => { notifications.push(value); } } as never, {} as never);
    await broken.runOnce(); expect(state.status).toBe("na_fila");
    await broken.runOnce(); expect(state.status).toBe("na_fila");
    await broken.runOnce();
    expect(state.status).toBe("falhou");
    expect(state.failure).toBe("Não foi possível concluir a tarefa com o bot. Tente de novo.");
    expect(state.failure).not.toContain("token secreto");
    expect(notifications).toHaveLength(1);
  });
});
