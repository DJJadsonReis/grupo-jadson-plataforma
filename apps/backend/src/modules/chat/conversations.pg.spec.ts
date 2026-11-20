import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ConversationsService } from "./conversations.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testDatabaseName = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, "")) : "";
if (databaseUrl && (!testDatabaseName || !/(?:^|[_-])test(?:$|[_-])/i.test(testDatabaseName))) {
  throw new Error("TEST_DATABASE_URL precisa apontar para uma base separada cujo nome contenha 'test'.");
}
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("histórico de conversa isolado por principal no PostgreSQL", () => {
  let database: DatabaseService;
  let conversations: ConversationsService;
  const ownerA = `owner-a-${randomUUID()}`;
  const ownerB = `owner-b-${randomUUID()}`;
  const conversationId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
    conversations = new ConversationsService(database, { record: async () => undefined } as never);
  });

  afterAll(async () => {
    await conversations?.remove(conversationId, ownerA);
    await database?.onModuleDestroy();
  });

  it("lists, appends, titles and deletes only for the owning principal", async () => {
    await conversations.create(conversationId, "private chat", undefined, undefined, ownerA);
    expect(await conversations.operationMode(conversationId, ownerA)).toEqual({ mode: "automatico", inherited: true });
    await conversations.setOperationMode(conversationId, ownerA, "planejamento", "admin", "Admin");
    expect(await new ConversationsService(database, { record: async () => undefined } as never).operationMode(conversationId, ownerA)).toEqual({ mode: "planejamento", inherited: false });
    await conversations.addMessage(conversationId, "user", "segredo local", {}, ownerA);
    const usageId = randomUUID();
    await database.getPool().query(
      "INSERT INTO usage_events(id,conversation_id,provider,model) VALUES($1,$2,'test','test-model')",
      [usageId, conversationId],
    );

    expect((await conversations.list(ownerA)).some((item) => item.id === conversationId)).toBe(true);
    expect((await conversations.list(ownerB)).some((item) => item.id === conversationId)).toBe(false);
    await expect(conversations.addMessage(conversationId, "assistant", "invasão", {}, ownerB)).rejects.toBeInstanceOf(NotFoundException);
    expect(await conversations.setTitleForFirstResponse(conversationId, "título externo", ownerB)).toBe(false);
    expect(await conversations.remove(conversationId, ownerB)).toBe(false);

    const stillPrivate = (await conversations.list(ownerA)).find((item) => item.id === conversationId);
    expect(stillPrivate?.messages.map((item) => item.content)).toEqual(["segredo local"]);
    expect(await conversations.setTitleForFirstResponse(conversationId, "meu título", ownerA)).toBe(true);
    expect(await conversations.remove(conversationId, ownerA)).toBe(true);
    expect((await database.getPool().query("SELECT count(*)::int AS count FROM conversations WHERE id=$1", [conversationId])).rows[0].count).toBe(0);
    expect((await database.getPool().query("SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1", [conversationId])).rows[0].count).toBe(0);
    expect((await database.getPool().query("SELECT conversation_id FROM usage_events WHERE id=$1", [usageId])).rows[0].conversation_id).toBeNull();
    await database.getPool().query("DELETE FROM usage_events WHERE id=$1", [usageId]);
    expect((await conversations.list(ownerA)).some((item) => item.id === conversationId)).toBe(false);
    await expect(conversations.remove(randomUUID(), ownerA)).resolves.toBe(false);
  });

  it("keeps existing conversations assigned to the system principal", async () => {
    const legacyId = randomUUID();
    await database.getPool().query("INSERT INTO conversations(id,title) VALUES($1,$2)", [legacyId, `legacy-${legacyId}`]);
    try {
      expect((await conversations.list("sistema")).some((item) => item.id === legacyId)).toBe(true);
      expect((await conversations.list(ownerA)).some((item) => item.id === legacyId)).toBe(false);
    } finally {
      await database.getPool().query("DELETE FROM conversations WHERE id=$1 AND owner_id='sistema'", [legacyId]);
    }
  });
});
