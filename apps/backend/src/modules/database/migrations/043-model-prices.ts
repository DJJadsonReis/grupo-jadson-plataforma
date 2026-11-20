import { Pool } from "pg";

export const migrationId = "043-model-prices";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS model_prices (
    provider text NOT NULL,
    model text NOT NULL,
    input_usd_per_million numeric(12,4) NOT NULL CHECK (input_usd_per_million >= 0),
    output_usd_per_million numeric(12,4) NOT NULL CHECK (output_usd_per_million >= 0),
    updated_by text NOT NULL DEFAULT 'sistema',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, model)
  )`);
}
