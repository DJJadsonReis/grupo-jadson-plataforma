import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ConversationsService } from "./conversations.service";
import { generateConversationTitle } from "./conversation-title";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

function providerResponse(title: string): Promise<Response> {
  const events = `data: ${JSON.stringify({ choices: [{ delta: { content: title } }] })}\n\ndata: [DONE]\n\n`;
  return Promise.resolve(new Response(events));
}

describeWithPostgres("título de conversa no PostgreSQL", () => {
  let database: DatabaseService;
  let conversations: ConversationsService;
  beforeAll(async () => { process.env.DATABASE_URL = databaseUrl; database = new DatabaseService(); await database.onModuleInit(); conversations = new ConversationsService(database); });
  afterAll(async () => { await database.onModuleDestroy(); });

  it("grava título gerado pelo provider simulado", async () => {
    const id = randomUUID();
    try {
      await conversations.create(id, "pergunta inicial única");
      const title = await generateConversationTitle(async () => providerResponse("Título gerado no teste"), undefined, "pergunta", "resposta");
      expect(title).toBe("Título gerado no teste");
      expect(await conversations.setTitleForFirstResponse(id, title!)).toBe(true);
      const row = await database.getPool().query(`SELECT title FROM conversations WHERE id=$1`, [id]);
      expect(row.rows[0].title).toBe("Título gerado no teste");
    } finally { await database.getPool().query(`DELETE FROM conversations WHERE id=$1`, [id]); }
  });

  it("mantém título anterior quando o provider falha", async () => {
    const id = randomUUID();
    try {
      await conversations.create(id, "título anterior único");
      const title = await generateConversationTitle(async () => { throw new Error("provider dublado indisponível"); }, undefined, "pergunta", "resposta");
      if (title) await conversations.setTitleForFirstResponse(id, title);
      const row = await database.getPool().query(`SELECT title FROM conversations WHERE id=$1`, [id]);
      expect(title).toBeNull();
      expect(row.rows[0].title).toBe("título anterior único");
    } finally { await database.getPool().query(`DELETE FROM conversations WHERE id=$1`, [id]); }
  });
});
