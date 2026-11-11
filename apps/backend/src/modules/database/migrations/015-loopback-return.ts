import { Pool } from "pg";

export const migrationId = "015-loopback-return";

/** Endereço local (loopback) para onde o desktop recebe a sessão depois do login. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE auth_flows ADD COLUMN IF NOT EXISTS return_uri text`);
}
