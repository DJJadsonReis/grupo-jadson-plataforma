import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "./notifications.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("notificações internas no PostgreSQL", () => {
  let database: DatabaseService;
  let notifications: NotificationsService;
  beforeAll(async () => { process.env.DATABASE_URL = databaseUrl; database = new DatabaseService(); await database.onModuleInit(); notifications = new NotificationsService(database); });
  afterAll(async () => { await database.onModuleDestroy(); });

  it("registra eventos relevantes, lista por principal e marca leitura só pelo owner", async () => {
    const ownerA = `notify-a-${randomUUID()}`;
    const ownerB = `notify-b-${randomUUID()}`;
    const created: { id: string }[] = [];
    try {
      for (const [kind, title] of [["approval.pending", "Aprovação"], ["routine.failed", "Rotina"], ["tool_limit.reached", "Limite"]] as const) {
        created.push(await notifications.create({ owner: ownerA, kind, title }));
      }
      const other = await notifications.create({ owner: ownerB, kind: "approval.pending", title: "Privada B" });
      created.push(other);
      expect((await notifications.listUnread(ownerA)).map((row) => row.kind).sort()).toEqual(["approval.pending", "routine.failed", "tool_limit.reached"].sort());
      expect((await notifications.listUnread(ownerB)).map((row) => row.title)).toEqual(["Privada B"]);
      await expect(notifications.markRead(ownerB, created[0]!.id)).rejects.toThrow();
      await notifications.markRead(ownerA, created[0]!.id);
      expect((await notifications.listUnread(ownerA)).map((row) => row.id)).not.toContain(created[0]!.id);
      expect((await notifications.listUnread(ownerB)).map((row) => row.id)).toContain(other.id);
    } finally {
      await database.getPool().query(`DELETE FROM notifications WHERE owner = ANY($1::text[])`, [[ownerA, ownerB]]);
    }
  });
});
