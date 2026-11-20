import { Pool } from "pg";

export const migrationId = "018-routine-claims";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE routines ADD COLUMN IF NOT EXISTS claim_until timestamptz`);
  await pool.query(`ALTER TABLE routines ADD COLUMN IF NOT EXISTS claim_token uuid`);
}
