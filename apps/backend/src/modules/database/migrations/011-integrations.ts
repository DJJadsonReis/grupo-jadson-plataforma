import { Pool } from "pg";

export const migrationId = "011-integrations";

/** Chaves de serviços externos, guardadas só no banco local. Nunca são devolvidas pela API. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS integrations (
    name text PRIMARY KEY,
    secret text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
