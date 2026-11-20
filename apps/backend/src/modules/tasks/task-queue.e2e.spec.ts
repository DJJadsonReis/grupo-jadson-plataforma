import { ConflictException, NotFoundException } from "@nestjs/common";
import { TaskQueueService } from "./task-queue.service";

describe("fila de tarefas e2e", () => {
  it("enfileira, executa, mascara resultado, notifica e audita", async () => {
    const persisted = { status: "aberta", result: "", agentId: null as string | null, attempts: 0, claimUntil: null as Date | null, claimToken: "" };
    const events: string[] = [];
    const db = { isReady: () => true, getPool: () => ({ query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT status,agent_id")) return { rowCount: 1, rows: [{ ...persisted, title: "Pesquisar", description: "Informe riscos" }] };
      if (sql.includes("SELECT id,name,role FROM users")) return { rowCount: 1, rows: [{ id: "owner", name: "Pessoa", role: "operator" }] };
      if (sql.includes("UPDATE tasks SET agent_id")) { persisted.status = "na_fila"; persisted.agentId = String(params[2]); return { rowCount: 1, rows: [{}] }; }
      if (sql.includes("UPDATE tasks SET status='na_fila',claim_until=NULL")) { if (persisted.status === "em_andamento" && persisted.claimUntil && persisted.claimUntil <= (params[0] as Date) && persisted.attempts < 3) { persisted.status = "na_fila"; persisted.claimToken = ""; persisted.claimUntil = null; return { rowCount: 1, rows: [] }; } return { rowCount: 0, rows: [] }; }
      if (sql.includes("UPDATE tasks SET status='falhou',failure_message=$2")) { if (persisted.status === "em_andamento" && persisted.claimUntil && persisted.claimUntil <= (params[0] as Date) && persisted.attempts >= 3) { persisted.status = "falhou"; persisted.result = ""; return { rowCount: 1, rows: [{ id: "task", ownerId: "owner" }] }; } return { rowCount: 0, rows: [] }; }
      if (sql.includes("UPDATE tasks SET status='aberta'")) { persisted.status = "aberta"; persisted.agentId = null; return { rowCount: 1, rows: [{}] }; }
      if (sql.includes("UPDATE tasks SET status='em_andamento'")) { if (persisted.status !== "na_fila") return { rowCount: 0, rows: [] }; persisted.status = "em_andamento"; persisted.attempts += 1; persisted.claimUntil = params[1] as Date; persisted.claimToken = String(params[2]); return { rowCount: 1, rows: [{ id: "task", ownerId: "owner", title: "Pesquisar", description: "Informe riscos", agentId: "agent", claimToken: persisted.claimToken, attempts: persisted.attempts }] }; }
      if (sql.includes("FROM agents WHERE id=$1 AND enabled=true")) return { rowCount: 1, rows: [{ id: "agent", name: "Bot", enabled: true, instructions: "", provider: "openai", model: "", generationConfig: {}, providerKind: "model" }] };
      if (sql.includes("UPDATE tasks SET result=")) { persisted.status = "concluida"; persisted.result = String(params[2]); persisted.claimUntil = null; persisted.claimToken = ""; return { rowCount: 1, rows: [{}] }; }
      return { rowCount: 0, rows: [] };
    } }) };
    const queue = new TaskQueueService(db as never, { assertCanUse: async () => "owner" } as never, { get: async () => ({ id: "agent", enabled: true }) } as never,
      { stream: async () => new Response('data: {"choices":[{"delta":{"content":"Resultado token sk-12345678"}}]}\n\ndata: [DONE]\n\n') } as never,
      { secretsForMasking: async () => ["sk-12345678"] } as never,
      { create: async (item: { kind: string }) => { events.push(item.kind); } } as never,
      { record: async (item: { action: string }) => { events.push(item.action); } } as never);
    await queue.enqueue("owner", "task", "agent");
    await queue.runOnce();
    expect(persisted.status).toBe("concluida");
    expect(persisted.result).toContain("[REDACTED]");
    expect(events).toEqual(["task.queued", "task.completed"]);
  });

  it("impede estados de fila pelo PATCH, protege tarefa de outra pessoa e limita cancelamento", async () => {
    await expect(new TaskQueueService({ getPool: () => ({ query: async () => ({ rowCount: 0, rows: [] }) }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never).enqueue("other", "123e4567-e89b-42d3-a456-426614174000", "agent")).rejects.toBeInstanceOf(NotFoundException);
    const queue = new TaskQueueService({ getPool: () => ({ query: async (sql: string) => sql.includes("SELECT status,agent_id") ? { rowCount: 1, rows: [{ status: "em_andamento", agentId: "agent" }] } : { rowCount: 0, rows: [] } }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(queue.cancel("owner", "123e4567-e89-42d3-a456-426614174000")).rejects.toBeInstanceOf(ConflictException);
  });

  it("recupera lease vencido e executa a tarefa na passagem seguinte", async () => {
    const { queue, persisted } = fixture({ status: "em_andamento", attempts: 1, claimUntil: new Date("2026-11-20T11:59:00Z"), claimToken: "old" });
    expect(await queue.runOnce(new Date("2026-11-20T12:00:00Z"))).toBe(1);
    expect(persisted.status).toBe("concluida"); expect(persisted.result).toContain("Resultado");
  });

  it("falha com mensagem segura e notifica ao expirar a terceira tentativa", async () => {
    const { queue, persisted, events } = fixture({ status: "em_andamento", attempts: 3, claimUntil: new Date("2026-11-20T11:59:00Z"), claimToken: "old" }, true);
    expect(await queue.runOnce(new Date("2026-11-20T12:00:00Z"))).toBe(0);
    expect(persisted.status).toBe("falhou"); expect(persisted.failure).toBe("Não foi possível concluir a tarefa com o bot. Tente de novo.");
    expect(persisted.failure).not.toContain("token técnico"); expect(events).toContain("task.failed");
  });

  it("preserva tarefa cujo lease ainda está válido", async () => {
    const { queue, persisted } = fixture({ status: "em_andamento", attempts: 1, claimUntil: new Date("2026-11-20T12:01:00Z"), claimToken: "valid" });
    expect(await queue.runOnce(new Date("2026-11-20T12:00:00Z"))).toBe(0);
    expect(persisted.status).toBe("em_andamento"); expect(persisted.claimToken).toBe("valid");
  });

  it("cancela tarefa na fila, reabre e limpa agent_id", async () => {
    const { queue, persisted } = fixture({ status: "na_fila", attempts: 0, agentId: "agent", claimUntil: null, claimToken: "queued" });
    await queue.cancel("owner", "task");
    expect(persisted.status).toBe("aberta"); expect(persisted.agentId).toBeNull();
  });
});

function fixture(initial: { status: string; attempts: number; agentId?: string; claimUntil: Date | null; claimToken: string }, failAgent = false) {
  const persisted: { status: string; attempts: number; agentId: string | null; claimUntil: Date | null; claimToken: string; result: string; failure: string } = { ...initial, agentId: initial.agentId ?? "agent", result: "", failure: "" };
  const events: string[] = [];
  const db = { isReady: () => true, getPool: () => ({ query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT status,agent_id")) return { rowCount: 1, rows: [{ status: persisted.status, agentId: persisted.agentId, title: "Pesquisar", description: "Informe riscos" }] };
    if (sql.includes("UPDATE tasks SET status='na_fila',claim_until=NULL")) { if (persisted.status === "em_andamento" && persisted.claimUntil && persisted.claimUntil <= (params[0] as Date) && persisted.attempts < 3) { persisted.status = "na_fila"; persisted.claimUntil = null; persisted.claimToken = ""; return { rowCount: 1, rows: [] }; } return { rowCount: 0, rows: [] }; }
    if (sql.includes("UPDATE tasks SET status='falhou',failure_message=$2")) { if (persisted.status === "em_andamento" && persisted.claimUntil && persisted.claimUntil <= (params[0] as Date) && persisted.attempts >= 3) { persisted.status = "falhou"; persisted.failure = String(params[1]); persisted.claimUntil = null; persisted.claimToken = ""; return { rowCount: 1, rows: [{ id: "task", ownerId: "owner" }] }; } return { rowCount: 0, rows: [] }; }
    if (sql.includes("UPDATE tasks SET status='aberta'")) { persisted.status = "aberta"; persisted.agentId = null; return { rowCount: 1, rows: [{}] }; }
    if (sql.includes("UPDATE tasks SET status='em_andamento'")) { if (persisted.status !== "na_fila") return { rowCount: 0, rows: [] }; persisted.status = "em_andamento"; persisted.attempts += 1; persisted.claimUntil = params[1] as Date; persisted.claimToken = String(params[2]); return { rowCount: 1, rows: [{ id: "task", ownerId: "owner", title: "Pesquisar", description: "Informe riscos", agentId: "agent", claimToken: persisted.claimToken, attempts: persisted.attempts }] }; }
    if (sql.includes("FROM agents WHERE id=$1 AND enabled=true")) { if (failAgent) throw new Error("token técnico simulado"); return { rowCount: 1, rows: [{ id: "agent", name: "Bot", enabled: true, instructions: "", provider: "openai", model: "", generationConfig: {}, providerKind: "model" }] }; }
    if (sql.includes("UPDATE tasks SET result=")) { persisted.status = "concluida"; persisted.result = String(params[2]); return { rowCount: 1, rows: [{}] }; }
    return { rowCount: 0, rows: [] };
  } }) };
  const queue = new TaskQueueService(db as never, { assertCanUse: async () => "owner" } as never, { get: async () => ({ id: "agent", enabled: true }) } as never,
    { stream: async () => new Response('data: {"choices":[{"delta":{"content":"Resultado"}}]}\n\ndata: [DONE]\n\n') } as never,
    { secretsForMasking: async () => [] } as never, { create: async (item: { kind: string }) => { events.push(item.kind); } } as never,
    { record: async (item: { action: string }) => { events.push(item.action); } } as never);
  return { queue, persisted, events };
}
