import { DatabaseService } from "../database/database.service";
import { ResponsibilitiesService } from "./responsibilities.service";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("claim de responsabilidades contra PostgreSQL real", () => {
  let database: DatabaseService;
  const owner = `responsibility-pg-${Date.now()}`;
  const agentId = "00000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
    await database.getPool().query(
      `INSERT INTO agents(id,name,description,instructions,model,enabled,owner_id)
       VALUES($1,'Responsibility test','','','',true,$2) ON CONFLICT(id) DO NOTHING`, [agentId, owner],
    );
  });

  afterAll(async () => {
    await database.getPool().query("DELETE FROM responsibilities WHERE owner_id=$1", [owner]);
    await database.getPool().query("DELETE FROM agents WHERE id=$1 AND owner_id=$2", [agentId, owner]);
    await database.onModuleDestroy?.();
  });

  it("duas instâncias concorrentes executam uma responsabilidade vencida uma vez", async () => {
    const providers = { stream: jest.fn(async () => new Response("data: [DONE]\n\n")) };
    const tools = { catalog: () => TOOL_DEFINITIONS, invoke: jest.fn(), maskSecretText: async (value: string) => value };
    const permissions = { access: jest.fn(async () => "owner") };
    const agents = { get: jest.fn(async () => ({ id: agentId, ownerId: owner, name: "Bot", enabled: true, instructions: "", model: "", provider: "openai", generationConfig: {}, toolsAllowed: [] })) };
    const audit = { record: jest.fn(async () => undefined) };
    const notifications = { create: jest.fn(async () => undefined) };
    const policy = { decisionFor: jest.fn(async () => null) };
    const skills = { loadPromptSkills: jest.fn(async () => []) };
    const first = new ResponsibilitiesService(database, agents as never, permissions as never, providers as never, tools as never, policy as never, audit as never, notifications as never, skills as never);
    const second = new ResponsibilitiesService(database, agents as never, permissions as never, providers as never, tools as never, policy as never, audit as never, notifications as never, skills as never);
    const created = await database.getPool().query(
      `INSERT INTO responsibilities(id,owner_id,agent_id,name,instructions,interval_minutes,next_run_at)
       VALUES(gen_random_uuid(),$1,$2,$3,'Executar teste',60,now()-interval '1 minute') RETURNING id`, [owner, agentId, `PG ${Date.now()}`],
    );
    const id = (created.rows[0] as { id: string }).id;
    await Promise.all([first.tick(new Date()), second.tick(new Date())]);
    expect(providers.stream).toHaveBeenCalledTimes(1);
    await database.getPool().query("DELETE FROM responsibilities WHERE id=$1", [id]);
  });
});
