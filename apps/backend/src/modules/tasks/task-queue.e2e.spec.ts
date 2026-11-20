import { ConflictException, NotFoundException } from "@nestjs/common";
import { TaskQueueService } from "./task-queue.service";

describe("fila de tarefas e2e", () => {
  it("enfileira, executa, mascara resultado, notifica e audita", async () => {
    const persisted = { status: "aberta", result: "", agentId: null as string | null };
    const events: string[] = [];
    const db = { isReady: () => true, getPool: () => ({ query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT status,agent_id")) return { rowCount: 1, rows: [{ ...persisted, title: "Pesquisar", description: "Informe riscos" }] };
      if (sql.includes("SELECT id,name,role FROM users")) return { rowCount: 1, rows: [{ id: "owner", name: "Pessoa", role: "operator" }] };
      if (sql.includes("UPDATE tasks SET agent_id")) { persisted.status = "na_fila"; persisted.agentId = String(params[2]); return { rowCount: 1, rows: [{}] }; }
      if (sql.includes("UPDATE tasks SET status='em_andamento'")) { if (persisted.status !== "na_fila") return { rowCount: 0, rows: [] }; persisted.status = "em_andamento"; return { rowCount: 1, rows: [{ id: "task", ownerId: "owner", title: "Pesquisar", description: "Informe riscos", agentId: "agent", claimToken: "claim", attempts: 1 }] }; }
      if (sql.includes("FROM agents WHERE id=$1 AND enabled=true")) return { rowCount: 1, rows: [{ id: "agent", name: "Bot", enabled: true, instructions: "", provider: "openai", model: "", generationConfig: {}, providerKind: "model" }] };
      if (sql.includes("UPDATE tasks SET result=")) { persisted.status = "concluida"; persisted.result = String(params[2]); return { rowCount: 1, rows: [{}] }; }
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
});
