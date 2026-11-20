import { Pool } from "pg";
import { DatabaseService } from "../database/database.service";
import { up as addUsageOwner } from "../database/migrations/034-usage-owner";
import { MODEL_PRICES_USD_PER_MILLION } from "./model-prices";
import { UsageService } from "./usage.service";

describe("UsageService end-to-end summary", () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  let pool: Pick<Pool, "query">;
  let service: UsageService;
  let realPool: Pool | null = null;

  beforeAll(async () => {
    if (testDatabaseUrl) {
      realPool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
      pool = realPool;
      await pool.query("CREATE TEMP TABLE conversations(id text, owner_id text, title text)");
      await pool.query(`CREATE TEMP TABLE usage_events(id text, conversation_id text, agent_id text, provider text, model text,
        prompt_tokens integer, completion_tokens integer, total_tokens integer, created_at timestamptz DEFAULT now())`);
      await addUsageOwner(realPool);
      await pool.query("INSERT INTO conversations VALUES ('ca','a','Conversa A'), ('cb','b','Conversa B')");
      await pool.query(`INSERT INTO usage_events(id,conversation_id,agent_id,provider,model,prompt_tokens,completion_tokens,total_tokens,owner_id)
        VALUES ('1','ca','bot','fixture','priced',1000000,0,1000000,'a'), ('2','cb','bot','fixture','unknown',1000000,0,1000000,'b')`);
    } else {
      const rows = [
        { groupId: "bot", provider: "fixture", model: "priced", promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, calls: 1 },
        { groupId: "bot", provider: "fixture", model: "unknown", promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, calls: 1 },
      ];
      pool = { query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("LEFT JOIN conversations")) return { rows: [{ ...rows[0], groupId: params?.[1] === "a" ? "ca" : "cb", title: params?.[1] === "a" ? "Conversa A" : "Conversa B" }] } as never;
        if (sql.includes("GROUP BY u.owner_id")) return { rows: rows.map((row, index) => ({ ...row, groupId: index ? "b" : "a" })) } as never;
        if (sql.includes("GROUP BY u.agent_id")) return { rows: [rows[0]] } as never;
        return { rows: [] } as never;
      }) } as unknown as Pick<Pool, "query">;
    }
    service = new UsageService({ getPool: () => pool } as unknown as DatabaseService);
  });

  afterAll(async () => { await realPool?.end(); });

  it("separates owners, returns admin people, and leaves unknown model cost null", async () => {
    MODEL_PRICES_USD_PER_MILLION["fixture:priced"] = { input: 2, output: 0 };
    const personA = await service.summaryForOwner("a", new Date(Date.now() - 60_000).toISOString());
    expect(personA.byConversation.map((line) => line.conversationId)).toEqual(["ca"]);
    expect(personA).not.toHaveProperty("byPerson");
    expect(personA.byConversation[0]?.costUsd).toBe(2);
    const admin = await service.summaryForOwner(null, new Date(Date.now() - 60_000).toISOString());
    expect(admin.byPerson?.map((line) => line.personId).sort()).toEqual(["a", "b"]);
    const unknown = admin.byPerson?.find((line) => line.personId === "b");
    expect(unknown?.costUsd).toBeNull();
    expect(unknown?.callsWithoutPrice).toBe(1);
    delete MODEL_PRICES_USD_PER_MILLION["fixture:priced"];
  });
});
