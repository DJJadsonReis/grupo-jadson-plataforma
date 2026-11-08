import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ApprovalsService } from "./approvals.service";
import { AuditService } from "./audit.service";
import { DatabaseService } from "../database/database.service";

type Query = { text: string; values: unknown[] };

function fakeDatabase(handler: (query: Query) => { rows: unknown[]; rowCount: number }) {
  const queries: Query[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      const query = { text, values };
      queries.push(query);
      return handler(query);
    },
  };
  const database = { getPool: () => pool } as unknown as DatabaseService;
  return { database, queries };
}

function fakeAudit() {
  const records: { action: string; actor?: string }[] = [];
  const audit = { record: async (input: { action: string; actor?: string }) => { records.push(input); } } as unknown as AuditService;
  return { audit, records };
}

describe("ApprovalsService", () => {
  it("rejeita solicitação sem ação ou sem descrição", async () => {
    const { database } = fakeDatabase(() => ({ rows: [], rowCount: 0 }));
    const { audit } = fakeAudit();
    const service = new ApprovalsService(database, audit);
    await expect(service.request({ action: " ", summary: "x" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.request({ action: "tool.run", summary: "  " })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cria solicitação pendente e registra na auditoria", async () => {
    const row = { id: "1", action: "tool.run", status: "pending", requestedBy: "agente" };
    const { database } = fakeDatabase(() => ({ rows: [row], rowCount: 1 }));
    const { audit, records } = fakeAudit();
    const service = new ApprovalsService(database, audit);
    const created = await service.request({ action: "tool.run", summary: "Executar script", requestedBy: "agente" });
    expect(created.status).toBe("pending");
    expect(records).toEqual([expect.objectContaining({ action: "approval.requested", actor: "agente" })]);
  });

  it("decide só solicitações pendentes e registra a decisão", async () => {
    const decided = { id: "1", action: "tool.run", status: "approved", decidedBy: "Jadson" };
    const { database } = fakeDatabase(() => ({ rows: [decided], rowCount: 1 }));
    const { audit, records } = fakeAudit();
    const service = new ApprovalsService(database, audit);
    const result = await service.decide("1", "approved", "Jadson");
    expect(result.status).toBe("approved");
    expect(records).toEqual([expect.objectContaining({ action: "approval.approved", actor: "Jadson" })]);
  });

  it("recusa decidir de novo uma solicitação já decidida", async () => {
    const { database } = fakeDatabase((query) => (query.text.startsWith("UPDATE") ? { rows: [], rowCount: 0 } : { rows: [{ status: "approved" }], rowCount: 1 }));
    const { audit } = fakeAudit();
    const service = new ApprovalsService(database, audit);
    await expect(service.decide("1", "rejected", "Jadson")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("responde 404 para solicitação inexistente", async () => {
    const { database } = fakeDatabase(() => ({ rows: [], rowCount: 0 }));
    const { audit } = fakeAudit();
    const service = new ApprovalsService(database, audit);
    await expect(service.decide("nope", "approved", "Jadson")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AuditService", () => {
  it("limita o número de eventos lidos entre 1 e 200", async () => {
    const { database, queries } = fakeDatabase(() => ({ rows: [], rowCount: 0 }));
    const service = new AuditService(database);
    await service.list(9999);
    await service.list(-5);
    expect(queries[0]?.values).toEqual([200]);
    expect(queries[1]?.values).toEqual([1]);
    await service.list(Number.NaN);
    expect(queries[2]?.values).toEqual([50]);
  });
});
