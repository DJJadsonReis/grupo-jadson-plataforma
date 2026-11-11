import { ForbiddenException, BadRequestException, NotFoundException } from "@nestjs/common";
import { AgentPolicyService } from "./agent-policy.service";
import { ToolsService } from "./tools.service";

const AGENT = "11111111-2222-4333-8444-555555555555";

function fakeDb(overrides: (sql: string) => { rowCount?: number; rows?: unknown[] } | undefined = () => undefined) {
  const calls: string[] = [];
  return {
    calls,
    db: {
      getPool: () => ({
        query: async (sql: string) => {
          calls.push(sql);
          const r = overrides(sql);
          return { rowCount: r?.rowCount ?? 0, rows: r?.rows ?? [] };
        },
      }),
    },
  };
}

describe("AgentPolicyService.set", () => {
  it("recusa decisão desconhecida", async () => {
    const { db } = fakeDb();
    await expect(new AgentPolicyService(db as never).set(AGENT, "tempo.agora", "talvez")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa agente com id que não é UUID", async () => {
    const { db } = fakeDb();
    await expect(new AgentPolicyService(db as never).set("nao-e-uuid", "tempo.agora", "allow")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa agente inexistente", async () => {
    const { db } = fakeDb(() => ({ rowCount: 0 }));
    await expect(new AgentPolicyService(db as never).set(AGENT, "tempo.agora", "allow")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("grava a regra quando o agente existe", async () => {
    const { db, calls } = fakeDb((sql) => (sql.startsWith("SELECT 1") ? { rowCount: 1 } : undefined));
    const saved = await new AgentPolicyService(db as never).set(AGENT, "memoria.apagar_tudo", "allow");
    expect(saved).toEqual({ agentId: AGENT, tool: "memoria.apagar_tudo", decision: "allow" });
    expect(calls.some((sql) => sql.includes("INSERT INTO agent_policies"))).toBe(true);
  });
});

describe("ToolsService.invoke com regra do agente", () => {
  function build(decision: string | null) {
    const audits: { action: string }[] = [];
    const approvalsRequested: unknown[] = [];
    const policies = { decisionFor: async () => decision } as unknown as AgentPolicyService;
    const audit = { record: async (entry: { action: string }) => { audits.push(entry); } };
    const approvals = { request: async (input: unknown) => { approvalsRequested.push(input); return { id: "ap1" }; } };
    const mcp = { catalog: () => [], find: () => undefined, call: async () => ({}) };
    const db = { getPool: () => ({ query: async () => ({ rows: [], rowCount: 1 }) }) };
    const memory = { list: async () => [] };
    const integrations = { secret: async () => undefined };
    const service = new ToolsService(db as never, approvals as never, audit as never, memory as never, mcp as never, integrations as never, policies);
    return { service, audits, approvalsRequested };
  }

  it("recusa com 'deny' e registra na auditoria", async () => {
    const { service, audits } = build("deny");
    await expect(service.invoke("tempo.agora", {}, "pessoa", AGENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audits.map((entry) => entry.action)).toContain("tool.refused");
  });

  it("dispensa aprovação de sensível com 'allow'", async () => {
    const { service, approvalsRequested } = build("allow");
    await service.invoke("memoria.apagar_tudo", {}, "pessoa", AGENT);
    expect(approvalsRequested).toHaveLength(0);
  });

  it("mantém aprovação de sensível sem regra", async () => {
    const { service, approvalsRequested } = build(null);
    await service.invoke("memoria.apagar_tudo", {}, "pessoa", AGENT);
    expect(approvalsRequested).toHaveLength(1);
  });
});
