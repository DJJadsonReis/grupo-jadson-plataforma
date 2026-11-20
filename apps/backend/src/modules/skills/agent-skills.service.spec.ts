import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AgentSkillsService } from "./agent-skills.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

const skill = { id: "skill-id", ownerId: "owner", slug: "research", title: "Pesquisa", summary: "", instructions: "Use fontes.", tools: [] as string[] };
const agentId = "6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
function setup(query: jest.Mock) {
  const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
  return { service: new AgentSkillsService(database), query };
}

describe("AgentSkillsService", () => {
  it.each([
    ["listForAgent", (service: AgentSkillsService) => service.listForAgent("owner", "abc")],
    ["attach", (service: AgentSkillsService) => service.attach("owner", "abc", "research")],
    ["detach", (service: AgentSkillsService) => service.detach("owner", "abc", "research")],
  ])("rejects malformed agent IDs in %s before querying", async (_operation, invoke) => {
    const query = jest.fn();
    const { service } = setup(query);
    await expect(invoke(service)).rejects.toMatchObject({
      status: 404,
      response: { code: "SKILL_NOT_FOUND", message: "Habilidade não encontrada." },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("allows a valid UUID in listForAgent", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const { service } = setup(query);
    await expect(service.listForAgent("owner", "6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b")).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("attaches an owned skill and repeats idempotently", async () => {
    let attached = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO agent_skills")) { attached = true; return { rowCount: 1 }; }
      if (sql.includes("FROM agents a CROSS JOIN skills")) return { rows: [skill] };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: 0 }] };
      return { rows: attached ? [skill] : [] };
    });
    const { service } = setup(query);
    await expect(service.attach("owner", agentId, "research")).resolves.toEqual(skill);
    await expect(service.attach("owner", agentId, "research")).resolves.toEqual(skill);
    expect(query.mock.calls.filter(([sql]) => /INSERT\s+INTO agent_skills/.test(String(sql)))).toHaveLength(1);
  });

  it("prefers the owner's skill when a global skill has the same slug", async () => {
    const own = { ...skill, id: "own" };
    const query = jest.fn(async (sql: string, _params: unknown[]) => {
      if (sql.includes("FROM agents a CROSS JOIN skills")) return { rows: [own] };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: 0 }] };
      if (sql.includes("INSERT INTO agent_skills")) return { rowCount: 1 };
      return { rows: [own] };
    });
    const { service } = setup(query);
    await expect(service.attach("owner", agentId, "research")).resolves.toEqual(own);
    expect(query.mock.calls[0]?.[0]).toContain("ORDER BY (s.owner_id=$2) DESC LIMIT 1");
    expect(query.mock.calls[0]?.[1]).toEqual([agentId, "owner", "research"]);
  });

  it("attaches a global skill from another owner and lists it", async () => {
    const globalSkill = { ...skill, ownerId: "admin", global: true };
    let attached = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO agent_skills")) { attached = true; return { rowCount: 1 }; }
      if (sql.includes("FROM agents a CROSS JOIN skills")) return { rows: [globalSkill] };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: 0 }] };
      if (sql.includes("FROM agent_skills link JOIN agents")) return { rows: attached ? [globalSkill] : [] };
      return { rows: [] };
    });
    const { service } = setup(query);
    await expect(service.attach("owner", agentId, "research")).resolves.toEqual(globalSkill);
    await expect(service.listForAgent("owner", agentId)).resolves.toEqual([globalSkill]);
    expect(query.mock.calls[0]?.[0]).toContain("s.owner_id=$2 OR s.global");
    expect(query.mock.calls.at(-1)?.[0]).toContain("s.owner_id=$2 OR s.global");
  });

  it.each(["bot de outra pessoa", "habilidade de outra pessoa", "slug inexistente"])("não anexa quando há %s", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const { service } = setup(query);
    await expect(service.attach("owner", agentId, "research")).rejects.toMatchObject({
      status: 404,
      response: { code: "SKILL_NOT_FOUND", message: "Habilidade não encontrada." },
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO agent_skills"))).toBe(false);
  });

  it("enforces the five skill limit before insert", async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("FROM agents a CROSS JOIN skills")) return { rows: [skill] };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: 5 }] };
      return { rows: [] };
    });
    const { service } = setup(query);
    await expect(service.attach("owner", agentId, "research")).rejects.toMatchObject({ response: { code: "SKILL_LIMIT" } });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO agent_skills"))).toBe(false);
  });

  it("detaches only an owned link and maps missing and foreign links uniformly", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
    const { service } = setup(query);
    await expect(service.detach("owner", agentId, "research")).resolves.toBeUndefined();
    await expect(service.detach("other", agentId, "research")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detach("owner", agentId, "absent")).rejects.toMatchObject({ response: { message: "Habilidade não encontrada." } });
    expect(query.mock.calls[0]?.[0]).toContain("link.owner_id=$2");
    expect(query.mock.calls[0]?.[0]).toContain("a.owner_id=$2");
    expect(query.mock.calls[0]?.[0]).toContain("s.owner_id=$2 OR s.global");
    expect(query.mock.calls[0]?.[0]).toContain("ORDER BY (s2.owner_id=$2) DESC LIMIT 1");
    expect(query.mock.calls[0]?.[1]).toEqual([agentId, "owner", "research"]);
  });

  it("prefers a linked skill when detaching duplicate slugs", async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const { service } = setup(query);
    await expect(service.detach("owner", agentId, "research")).resolves.toBeUndefined();
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("FROM agent_skills l2");
    expect(sql).toContain("l2.agent_id=$1");
    expect(sql).toContain("l2.owner_id=$2");
    expect(sql).toContain("ORDER BY (s2.owner_id=$2) DESC LIMIT 1");
    expect(query.mock.calls[0]?.[1]).toEqual([agentId, "owner", "research"]);
  });

  it("loads prompt skills in attachment order", async () => {
    const rows = [{ title: "A", instructions: "a", tools: ["pagina.ler"] }, { title: "B", instructions: "b", tools: [] }];
    const query = jest.fn().mockResolvedValue({ rows });
    const { service } = setup(query);
    await expect(service.loadPromptSkills("agent-id")).resolves.toEqual(rows);
    expect(query.mock.calls[0]?.[0]).toContain("ORDER BY link.created_at ASC");
  });
});

describeWithPostgres("desvinculação de habilidades no PostgreSQL", () => {
  let database: DatabaseService;
  const ownerId = `skill-detach-${randomUUID()}`;
  const agentId = randomUUID();
  const globalSkillId = randomUUID();
  const ownSkillId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
    const pool = database.getPool();
    await pool.query("INSERT INTO agents(id,name,owner_id) VALUES($1,$2,$3)", [agentId, `detach-${agentId}`, ownerId]);
    await pool.query(
      "INSERT INTO skills(id,owner_id,slug,title,instructions,global,tools) VALUES($1,$2,$3,$4,$5,true,'{}'),($6,$7,$3,$8,$5,false,'{}')",
      [globalSkillId, "admin-detach-test", "research", "Global", "Use fontes.", ownSkillId, ownerId, "Pessoal"],
    );
    await pool.query("INSERT INTO agent_skills(agent_id,skill_id,owner_id) VALUES($1,$2,$3)", [agentId, globalSkillId, ownerId]);
  });

  afterAll(async () => {
    if (database?.isReady()) {
      const pool = database.getPool();
      await pool.query("DELETE FROM agents WHERE id=$1", [agentId]);
      await pool.query("DELETE FROM skills WHERE id = ANY($1::uuid[])", [[globalSkillId, ownSkillId]]);
    }
    await database?.onModuleDestroy();
  });

  it("remove a global vinculada mesmo com uma própria não vinculada de mesmo slug", async () => {
    const service = new AgentSkillsService(database);
    await expect(service.detach(ownerId, agentId, "research")).resolves.toBeUndefined();
    const links = await database.getPool().query("SELECT skill_id FROM agent_skills WHERE agent_id=$1", [agentId]);
    expect(links.rows).toEqual([]);
  });
});
