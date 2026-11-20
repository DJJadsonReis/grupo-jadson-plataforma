import { Pool } from "pg";

export const migrationId = "040-model-availability";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS model_availability (
    provider_id uuid NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
    model_id text NOT NULL,
    status text NOT NULL CHECK (status IN ('disponivel','indisponivel','nao_verificado')),
    checked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_id, model_id)
  )`);
}
