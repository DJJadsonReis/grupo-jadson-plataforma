import { Pool } from "pg";

export const migrationId = "016-google-connections";

/** Conexão de cada pessoa com o Google (Drive e Agenda). O refresh token fica cifrado. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS google_connections (
    user_id text PRIMARY KEY,
    refresh_token text NOT NULL,
    scope text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
