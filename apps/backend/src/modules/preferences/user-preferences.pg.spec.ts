import { DatabaseService } from "../database/database.service";
import { UserPreferencesController } from "./user-preferences.controller";
import { UserPreferencesService } from "./user-preferences.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("preferências por principal no PostgreSQL", () => {
  let database: DatabaseService;
  let service: UserPreferencesService;
  beforeAll(async () => { process.env.DATABASE_URL = databaseUrl; database = new DatabaseService(); await database.onModuleInit(); service = new UserPreferencesService(database); });
  afterAll(async () => { await database.onModuleDestroy(); });

  it("grava e lê por principal; corpo não permite alterar a preferência de outro", async () => {
    const ownerA = `pg-pref-a-${crypto.randomUUID()}`;
    const ownerB = `pg-pref-b-${crypto.randomUUID()}`;
    const controller = new UserPreferencesController(service);
    try {
      await controller.update({ principal: { id: ownerA } }, { owner: ownerB, instructions: "Preferência privada A", responseStyle: "concise" });
      expect(await service.read(ownerA)).toEqual({ instructions: "Preferência privada A", responseStyle: "concise" });
      expect(await service.read(ownerB)).toEqual({ instructions: "", responseStyle: "balanced" });
      await service.update(ownerB, { instructions: "Preferência privada B" });
      expect(await service.read(ownerA)).toEqual({ instructions: "Preferência privada A", responseStyle: "concise" });
      expect(await service.read(ownerB)).toEqual({ instructions: "Preferência privada B", responseStyle: "balanced" });
    } finally {
      await database.getPool().query(`DELETE FROM user_preferences WHERE owner = ANY($1::text[])`, [[ownerA, ownerB]]);
    }
  });
});
