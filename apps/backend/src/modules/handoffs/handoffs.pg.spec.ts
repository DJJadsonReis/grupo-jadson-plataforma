import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DatabaseService } from "../database/database.service";
import { up as migrateHandoffContext } from "../database/migrations/049-handoff-context";
import { HandoffsService } from "./handoffs.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const databaseName = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, "")) : "";
if (databaseUrl && (!databaseName || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName))) throw new Error("TEST_DATABASE_URL precisa apontar para uma base separada cujo nome contenha 'test'.");
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("handoffs PostgreSQL", () => {
  let database: DatabaseService;
  const ownerId = randomUUID(), conversationId = randomUUID(), fromAgentId = randomUUID(), toAgentId = randomUUID();
  const principal = { id: ownerId, name: "Teste", role: "operator" as const };
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService(); await database.onModuleInit();
    const pool = database.getPool();
    await pool.query("INSERT INTO users(id,name,role,token_hash) VALUES($1,'handoff test','operator',$2)", [ownerId, ownerId]);
    await pool.query("INSERT INTO agents(id,name,owner_id,enabled) VALUES($1,'Origem',$3,true),($2,'Destino',$3,true)", [fromAgentId, toAgentId, ownerId]);
    await pool.query("INSERT INTO conversations(id,title,owner_id) VALUES($1,'handoff test',$2)", [conversationId, ownerId]);
    await pool.query("INSERT INTO messages(id,conversation_id,role,content) VALUES($1,$2,'user',$3)", [randomUUID(), conversationId, "contexto de teste"]);
  });
  afterAll(async () => {
    if (database?.isReady()) { await database.getPool().query("DELETE FROM conversations WHERE id=$1", [conversationId]); await database.getPool().query("DELETE FROM agents WHERE id=ANY($1::uuid[])", [[fromAgentId, toAgentId]]); await database.getPool().query("DELETE FROM users WHERE id=$1", [ownerId]); }
    await database?.onModuleDestroy();
  });
  it("aplica migração repetidamente, grava contexto e marca uma única aplicação", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try { await migrateHandoffContext(pool); await migrateHandoffContext(pool); }
    finally { await pool.end(); }
    const service = new HandoffsService(database, { get: async (id: string) => ({ id, name: "Destino", enabled: true }) } as never,
      { record: async () => undefined } as never, { assertCanUse: async () => "owner" } as never);
    const result = await service.create({ conversationId, fromAgentId, toAgentId, reason: "investigar" }, principal);
    expect(result.context).toContain("contexto de teste"); expect(result.appliedAt).toBeNull();
    expect(await service.consumeContext(conversationId, toAgentId)).toContain("Contexto da delegação");
    expect(await service.consumeContext(conversationId, toAgentId)).toBeNull();
    const message = await database.getPool().query("SELECT content FROM messages WHERE conversation_id=$1 AND content LIKE 'Conversa passada de %'", [conversationId]);
    expect(message.rows[0]?.content).toContain("investigar");
  });
});
