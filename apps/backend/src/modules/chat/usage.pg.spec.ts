import { Pool } from "pg";
import { DatabaseService } from "../database/database.service";
import { up as addUsageOwner } from "../database/migrations/034-usage-owner";
import { up as addModelPrices } from "../database/migrations/043-model-prices";
import { UsageService } from "./usage.service";

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("UsageService model prices PostgreSQL", () => {
  let pool: Pool;
  let service: UsageService;
  const suffix = `fixture-${Date.now()}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    await addUsageOwner(pool);
    await addModelPrices(pool);
    await pool.query(`INSERT INTO usage_events(id,conversation_id,agent_id,provider,model,prompt_tokens,completion_tokens,total_tokens,owner_id)
      VALUES($1,NULL,'fixture-bot',$2,$3,1000,500,1500,$4)`, [`${suffix}-usage`, suffix, "model", suffix]);
    service = new UsageService({ getPool: () => pool } as unknown as DatabaseService);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM usage_events WHERE id=$1", [`${suffix}-usage`]);
      await pool.query("DELETE FROM model_prices WHERE provider=$1 AND model='model'", [suffix]);
      await pool.end();
    }
  });

  it("upserts a real database price and calculates usage cost", async () => {
    await service.setPrice({ provider: suffix, model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }, "fixture-admin");
    const result = await service.summaryForOwner(suffix, new Date(Date.now() - 60_000).toISOString());
    expect(result.byAgent[0]?.costUsd).toBe(0.006);
  });
});
