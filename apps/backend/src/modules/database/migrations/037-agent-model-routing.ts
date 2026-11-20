import { Pool } from "pg";

export const migrationId = "037-agent-model-routing";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_routing jsonb NOT NULL DEFAULT '{}'::jsonb");
}
