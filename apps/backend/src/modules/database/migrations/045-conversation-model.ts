import { Pool } from "pg";

export const migrationId = "045-conversation-model";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_provider_id uuid NULL REFERENCES model_providers(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model text NULL");
}
