import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AgentSkillsService } from "./agent-skills.service";

const skill = { id: "skill-id", ownerId: "owner", slug: "research", title: "Pesquisa", summary: "", instructions: "Use fontes." };
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
    expect(query.mock.calls[0][0]).toContain("link.owner_id=$2");
    expect(query.mock.calls[0][0]).toContain("a.owner_id=$2");
    expect(query.mock.calls[0][0]).toContain("s.owner_id=$2");
  });

  it("loads prompt skills in attachment order", async () => {
    const rows = [{ title: "A", instructions: "a" }, { title: "B", instructions: "b" }];
    const query = jest.fn().mockResolvedValue({ rows });
    const { service } = setup(query);
    await expect(service.loadPromptSkills("agent-id")).resolves.toEqual(rows);
    expect(query.mock.calls[0][0]).toContain("ORDER BY link.created_at ASC");
  });
});
