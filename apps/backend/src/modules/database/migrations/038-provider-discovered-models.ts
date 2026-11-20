import { Pool } from "pg";

export const migrationId = "038-provider-discovered-models";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE model_providers
    ADD COLUMN IF NOT EXISTS models_json jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'model_providers_models_json_array') THEN
      ALTER TABLE model_providers ADD CONSTRAINT model_providers_models_json_array CHECK (jsonb_typeof(models_json) = 'array');
    END IF;
  END $$`);
}
