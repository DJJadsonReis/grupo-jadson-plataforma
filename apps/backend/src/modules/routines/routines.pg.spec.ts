import { NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
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

  it("falha de rotina notifica o dono da rotina, não o owner genérico", async () => {
    const owner = `dono-${Date.now()}`;
    const tools = { invoke: jest.fn(async () => { throw new Error("falha simulada"); }), catalog: () => TOOL_DEFINITIONS, maskSecretText: async (text: string) => text } as never;
    const notifications = new NotificationsService(database);
    const service = new RoutinesService(database, tools, notifications);

    const routine = await service.create({ name: `falha-${Date.now()}`, tool: "tempo.agora", intervalMinutes: 60, owner });
    await database.getPool().query("UPDATE routines SET next_run_at = $2 WHERE id = $1", [routine.id, new Date(Date.now() - 60_000)]);
    await service.tick(new Date());

    const owned = await notifications.listUnread(owner);
    expect(owned.map((item) => item.kind)).toContain("routine.failed");
    const generic = await notifications.listUnread("sistema");
    expect(generic.filter((item) => item.details?.routineId === routine.id)).toHaveLength(0);
  });

  it("dono não lista, liga/desliga nem remove rotina de outro dono", async () => {
    const tools = { invoke: jest.fn(async () => ({})), catalog: () => TOOL_DEFINITIONS, maskSecretText: async (text: string) => text } as never;
    const service = new RoutinesService(database, tools);
    const ownerA = `dono-a-${Date.now()}`;
    const ownerB = `dono-b-${Date.now()}`;
    const routine = await service.create({ name: `isolada-${Date.now()}`, tool: "tempo.agora", intervalMinutes: 60, owner: ownerA });

    expect((await service.list(ownerA)).map((item) => item.id)).toContain(routine.id);
    expect((await service.list(ownerB)).map((item) => item.id)).not.toContain(routine.id);
    await expect(service.setEnabled(routine.id, false, ownerB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(routine.id, ownerB)).rejects.toBeInstanceOf(NotFoundException);

    const stillThere = await database.getPool().query("SELECT enabled FROM routines WHERE id = $1", [routine.id]);
    expect(stillThere.rows[0]).toEqual({ enabled: true });
    await service.remove(routine.id, ownerA);
  });

  it("cria e executa rotina diária no próximo HH:MM, persistindo o resultado e liberando claim", async () => {
    const owner = `diaria-${Date.now()}`;
    const invoke = jest.fn(async () => ({}));
    const tools = { invoke, catalog: () => TOOL_DEFINITIONS, maskSecretText: async (text: string) => text } as never;
    const service = new RoutinesService(database, tools);
    const routine = await service.create({ name: `diária-${Date.now()}`, tool: "tempo.agora", dailyAt: "08:00", owner });
    expect(routine.dailyAt).toBe("08:00");
    const inserted = await database.getPool().query("SELECT interval_minutes, daily_at FROM routines WHERE id = $1", [routine.id]);
    expect(inserted.rows[0]).toEqual({ interval_minutes: 1440, daily_at: "08:00" });

    const now = new Date(2026, 0, 31, 9);
    await database.getPool().query("UPDATE routines SET next_run_at = $2 WHERE id = $1", [routine.id, new Date(now.getTime() - 60_000)]);
    await service.tick(now);
    const finished = await database.getPool().query("SELECT next_run_at, last_status, claim_until, claim_token FROM routines WHERE id = $1", [routine.id]);
    expect(new Date(finished.rows[0].next_run_at).getTime()).toBe(new Date(2026, 1, 1, 8).getTime());
    expect(finished.rows[0].last_status).toBe("done");
    expect(finished.rows[0].claim_until).toBeNull();
    expect(finished.rows[0].claim_token).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    await service.remove(routine.id, owner);
  });
});
