import { Pool } from "pg";

export const migrationId = "020-routine-owner";

/**
 * Dono da rotina. Rotinas já existentes ficam com "sistema", que é o dono anterior.
 * Rotinas novas recebem o id do principal autenticado na criação.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE routines ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'sistema'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS routines_owner_idx ON routines(owner)`);
}
