import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ConversationsService } from "./conversations.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
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
    conversations = new ConversationsService(database);
  });

  afterAll(async () => {
    await conversations?.remove(conversationId, ownerA);
    await database?.onModuleDestroy();
  });

  it("lists, appends, titles and deletes only for the owning principal", async () => {
    await conversations.create(conversationId, "private chat", undefined, undefined, ownerA);
    await conversations.addMessage(conversationId, "user", "segredo local", {}, ownerA);

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
    expect((await conversations.list(ownerA)).some((item) => item.id === conversationId)).toBe(false);
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
