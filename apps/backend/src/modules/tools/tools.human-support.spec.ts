import { ToolsService } from "./tools.service";

function setup(options: { users?: Array<{ id: string; role: string; active: boolean }>; mask?: (text: string) => string; notificationFails?: boolean } = {}) {
  const runs = new Map<string, Record<string, unknown>>();
  const notices: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const pool = { query: async (sql: string, values: unknown[] = []) => {
    if (sql.includes("SELECT id FROM users")) {
      const admins = (options.users ?? []).filter((user) => user.role === "admin" && user.active).map(({ id }) => ({ id }));
      return { rows: admins, rowCount: admins.length };
    }
    if (sql.startsWith("INSERT INTO tool_runs")) {
      const [id, tool, requestedBy, status, input, output, approvalId] = values as [string, string, string, string, string, string | null, string | null];
      const row = { id, tool, requestedBy, status, input: JSON.parse(input), output: output ? JSON.parse(output) : null, approvalId, createdAt: "", finishedAt: null };
      runs.set(id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("FROM tool_runs WHERE id")) { const row = runs.get(values[0] as string); return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 }; }
    if (sql.startsWith("UPDATE tool_runs")) { const row = runs.get(values[0] as string); if (row) { row.output = JSON.parse(values[1] as string); row.status = values[2]; } return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  } };
  const service = new ToolsService(
    { getPool: () => pool } as never,
    { request: async () => ({ id: "approval-1" }), get: async () => ({ id: "approval-1", status: "approved" }) } as never,
    { record: async (event: Record<string, unknown>) => { audits.push(event); } } as never,
    {} as never,
    { catalog: () => [], find: () => undefined, call: async () => ({}) } as never,
    { secret: async () => undefined, secretValuesForMasking: async () => [] } as never,
    { decisionFor: async () => null } as never,
    {} as never,
    { create: async (notice: Record<string, unknown>) => { if (options.notificationFails) throw new Error("falha"); notices.push(notice); return notice; } } as never,
  );
  if (options.mask) service.maskSecretText = async (text) => options.mask!(text);
  return { service, notices, audits, pool };
}

describe("ToolsService — notificação de atendimento humano", () => {
  it("notifica somente administradores ativos e mascara motivo, limitando a 300 caracteres", async () => {
    const { service, notices } = setup({ users: [{ id: "admin-1", role: "admin", active: true }, { id: "viewer-1", role: "viewer", active: true }, { id: "admin-inativo", role: "admin", active: false }], mask: (text) => text.replace("token-secreto", "[mascarado]") });
    const pending = await service.invoke("atendimento.humano", { pessoaId: "falsificado", motivo: `token-secreto ${"x".repeat(400)}`, conversaId: "conv-1" }, "funcionario", undefined, "autor-real");
    expect(pending.status).toBe("pending_approval");
    expect(notices.filter((notice) => notice.kind === "human_support.requested")).toHaveLength(0);
    await service.executeApproved(pending.id, "admin-1");
    const supportNotices = notices.filter((notice) => notice.kind === "human_support.requested");
    expect(supportNotices).toHaveLength(1);
    expect(supportNotices.map((notice) => notice.owner)).not.toContain("admin-inativo");
    expect(supportNotices[0]).toMatchObject({ owner: "admin-1", kind: "human_support.requested", title: "Atendimento humano solicitado", details: { conversationId: "conv-1", requestedBy: "autor-real" } });
    expect(supportNotices[0]!.body).not.toContain("token-secreto");
    expect((supportNotices[0]!.body as string).length).toBeLessThanOrEqual(300);
  });

  it("usa sistema quando não há administrador ativo", async () => {
    const { service, notices } = setup();
    const pending = await service.invoke("atendimento.humano", { motivo: "Ajuda", conversaId: "conv-2" }, "pessoa", undefined, "pessoa-1");
    await service.executeApproved(pending.id, "admin");
    const supportNotices = notices.filter((notice) => notice.kind === "human_support.requested");
    expect(supportNotices).toHaveLength(1);
    expect(supportNotices[0]).toMatchObject({ owner: "sistema", details: { conversationId: "conv-2", requestedBy: "pessoa-1" } });
  });

  it("mantém a ferramenta registrada e a auditoria se falhar a notificação", async () => {
    const { service, audits } = setup({ users: [{ id: "admin-1", role: "admin", active: true }], notificationFails: true });
    const pending = await service.invoke("atendimento.humano", { motivo: "Ajuda", conversaId: "conv-3" }, "pessoa", undefined, "pessoa-1");
    const completed = await service.executeApproved(pending.id, "admin-1");
    expect(completed.output).toMatchObject({ registrada: true, mensagem: "Pedido de atendimento humano registrado internamente." });
    expect(audits).toContainEqual(expect.objectContaining({ action: "human_support.requested", subject: "conv-3" }));
  });
});
