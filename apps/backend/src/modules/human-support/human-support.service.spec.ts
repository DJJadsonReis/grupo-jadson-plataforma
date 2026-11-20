import { ForbiddenException, ConflictException } from "@nestjs/common";
import { HumanSupportService } from "./human-support.service";

const person = (id: string, role: "admin" | "operator" | "viewer" = "operator") => ({ id, name:id, role });

describe("HumanSupportService", () => {
  function setup() {
    const requests = new Map<string, Record<string, unknown>>();
    const attendants = new Set<string>();
    const notices: Record<string, unknown>[] = [];
    const audit = { record: jest.fn(async () => undefined) };
    const pool = { query: jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT 1 FROM human_support_attendants")) return { rowCount: attendants.has(String(values[0])) ? 1 : 0, rows: [] };
      if (sql.startsWith("INSERT INTO human_support_requests")) {
        const [id, conversationId, agentId, requestedBy, reason] = values as [string, string | null, string | null, string, string];
        const row = { id, conversationId, agentId, requestedBy, reason, status:"aberto", claimedBy:null, createdAt:"now", claimedAt:null, resolvedAt:null };
        requests.set(id,row); return { rows:[row], rowCount:1 };
      }
      if (sql.startsWith("UPDATE human_support_requests SET status='assumido'")) {
        const row = requests.get(String(values[0]));
        if (!row || row.status !== "aberto") return { rows:[], rowCount:0 };
        Object.assign(row,{ status:"assumido", claimedBy:values[1], claimedAt:"now" }); return { rows:[row], rowCount:1 };
      }
      if (sql.startsWith("UPDATE human_support_requests SET status='resolvido'")) {
        const row = requests.get(String(values[0]));
        if (!row || row.status !== "assumido" || (row.claimedBy !== values[1] && values[2] !== "admin")) return { rows:[], rowCount:0 };
        Object.assign(row,{ status:"resolvido", resolvedAt:"now" }); return { rows:[row], rowCount:1 };
      }
      if (sql.includes("SELECT status,claimed_by")) { const row = requests.get(String(values[0])); return { rows:row ? [row] : [], rowCount:row ? 1 : 0 }; }
      if (sql.includes("SELECT status FROM human_support_requests")) { const row = requests.get(String(values[0])); return { rows:row ? [row] : [], rowCount:row ? 1 : 0 }; }
      if (sql.includes("SELECT u.id FROM users")) return { rows:[{id:"admin"},{id:"attendant"}], rowCount:2 };
      return { rows:[], rowCount:0 };
    }) };
    attendants.add("attendant");
    const service = new HumanSupportService({ getPool:() => pool } as never, audit as never, { create:jest.fn(async (n) => { notices.push(n); return n; }) } as never);
    return { service, requests, attendants, notices, audit, pool };
  }
  it("opens masked requests, audits them, and notifies attendants except the requester", async () => {
    const { service, notices, audit } = setup();
    const opened = await service.open({ conversationId:"conv", agentId:"agent", requestedBy:"requester", reason:"use sk-teste-falso-000" });
    expect(opened).toMatchObject({ status:"aberto", conversationId:"conv" });
    expect(opened.reason).not.toContain("sk-teste-falso-000");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action:"human_support.requested" }));
    expect(notices.map((n) => n.owner)).toEqual(["admin","attendant"]);
  });
  it("denies non-attendants, allows one atomic claim, and only the assignee or admin can resolve", async () => {
    const { service } = setup();
    const opened = await service.open({ conversationId:null, agentId:null, requestedBy:"requester", reason:"Ajuda" });
    await expect(service.list(person("viewer","viewer"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.claim(opened.id,person("viewer","viewer"))).rejects.toBeInstanceOf(ForbiddenException);
    await service.claim(opened.id,person("attendant"));
    await expect(service.claim(opened.id,person("admin","admin"))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.resolve(opened.id,person("other"))).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.resolve(opened.id,person("attendant"))).status).toBe("resolvido");
  });
});
