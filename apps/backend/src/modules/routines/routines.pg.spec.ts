import { DatabaseService } from "../database/database.service";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";
import { RoutinesService } from "./routines.service";

/**
 * Teste de integração com PostgreSQL real. Roda só quando TEST_DATABASE_URL está definido;
 * caso contrário é ignorado. Usa o banco informado, que deve ser descartável.
 */
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("claim de rotinas contra PostgreSQL real", () => {
  let database: DatabaseService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
  });

  afterAll(async () => {
    await database.onModuleDestroy?.();
  });

  it("duas instâncias concorrentes disparam a mesma rotina vencida apenas uma vez", async () => {
    const invoke = jest.fn(async () => ({}));
    const tools = { invoke, catalog: () => TOOL_DEFINITIONS, maskSecretText: async (text: string) => text } as never;
    const instanceA = new RoutinesService(database, tools);
    const instanceB = new RoutinesService(database, tools);

    const routine = await instanceA.create({ name: `claim-${Date.now()}`, tool: "tempo.agora", intervalMinutes: 60 });
    const past = new Date(Date.now() - 60_000);
    await database.getPool().query("UPDATE routines SET next_run_at = $2 WHERE id = $1", [routine.id, past]);

    const now = new Date();
    const [ranA, ranB] = await Promise.all([instanceA.tick(now), instanceB.tick(now)]);

    expect(ranA + ranB).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
