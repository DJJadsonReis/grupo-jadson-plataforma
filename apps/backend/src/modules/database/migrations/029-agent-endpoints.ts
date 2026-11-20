import { Pool } from "pg";

export const migrationId = "029-agent-endpoints";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS provider_kind text NOT NULL DEFAULT 'model',
    ADD COLUMN IF NOT EXISTS endpoint_url text,
    ADD COLUMN IF NOT EXISTS endpoint_token_secret text`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE agents ADD CONSTRAINT agents_provider_kind_check CHECK (provider_kind IN ('model', 'endpoint'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
}
