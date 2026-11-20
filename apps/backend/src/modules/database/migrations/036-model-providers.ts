import { Pool } from "pg";

export const migrationId = "036-model-providers";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS model_providers (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('openai','anthropic','gemini','xai','custom')),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    base_url text,
    secret_ciphertext text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'custom' AND base_url IS NOT NULL) OR (kind <> 'custom' AND base_url IS NULL))
  )`);
}
